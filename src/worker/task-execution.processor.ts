import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job as BullJob } from 'bullmq';
import { Injectable, forwardRef, Inject } from '@nestjs/common';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { QUEUE_NAMES } from '../common/constants/queues.constant';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { TaskStateMachine } from '../task/state-machine/task-state-machine';
import { TaskEventType } from '../common/constants/events.constant';
import { ErrorCode } from '../common/constants/error-codes.constant';
import { AccountSelectionService } from '../account/account-selection.service';
import { AccountHealthService } from '../account/account-health.service';
import { AccountService } from '../account/account.service';
import { LeaseService } from '../lease/lease.service';
import { FailureClassifierService } from '../failure/failure-classifier.service';
import { RetryService } from '../retry/retry.service';
import { TelegramTaskExecutorService } from '../telegram/telegram-task-executor.service';
import { TaskService } from '../task/task.service';
import { JobService } from '../job/job.service';

@Processor(QUEUE_NAMES.TELEGRAM_TASKS, {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
})
@Injectable()
export class TaskExecutionProcessor extends WorkerHost {
  private readonly workerHostId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountSelectionService: AccountSelectionService,
    private readonly accountHealthService: AccountHealthService,
    @Inject(forwardRef(() => AccountService))
    private readonly accountService: AccountService,
    private readonly leaseService: LeaseService,
    private readonly failureClassifier: FailureClassifierService,
    private readonly retryService: RetryService,
    private readonly telegramExecutor: TelegramTaskExecutorService,
    @Inject(forwardRef(() => TaskService))
    private readonly taskService: TaskService,
    @Inject(forwardRef(() => JobService))
    private readonly jobService: JobService,
    private readonly logger: AppLogger,
  ) {
    super();
    this.logger.setContext(TaskExecutionProcessor.name);
    this.workerHostId = `${os.hostname()}-${process.pid}-${uuidv4().slice(0, 8)}`;
  }

  async process(bullJob: BullJob<{ taskId: string; tenantId: string }>): Promise<any> {
    const { taskId, tenantId } = bullJob.data;
    const logCtx = { taskId, tenantId, workerId: this.workerHostId };
    this.logger.log(`Worker picked up task ${taskId}`, logCtx);

    // 1. Fetch current task from PostgreSQL source of truth
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { assignedAccount: true },
    });

    if (!task) {
      this.logger.warn(`Task ${taskId} not found in database, ignoring`, logCtx);
      return;
    }

    if (TaskStateMachine.isTerminal(task.status)) {
      this.logger.log(`Task ${taskId} is in terminal state '${task.status}', skipping`, logCtx);
      return;
    }

    // 2. Select eligible account
    let selectedAccount = task.assignedAccount;
    let selectionReason = 'Pre-assigned account';

    if (!selectedAccount) {
      const selection = await this.accountSelectionService.selectEligibleAccount(
        tenantId,
        task.requiredCapability,
      );

      if (!selection.selectedAccount) {
        this.logger.warn(`No eligible account for task ${taskId}: ${selection.reason}`, logCtx);
        await this.prisma.$transaction([
          this.prisma.task.update({
            where: { id: taskId },
            data: { status: TaskStatus.WAITING_FOR_ACCOUNT },
          }),
          this.prisma.taskEvent.create({
            data: {
              taskId,
              tenantId,
              eventType: TaskEventType.TASK_QUEUED,
              metadata: { reason: selection.reason },
            },
          }),
        ]);
        // Re-enqueue for later when accounts may become available
        await this.taskService.enqueueTask(taskId, 10000);
        return;
      }

      selectedAccount = selection.selectedAccount;
      selectionReason = selection.reason;
    }

    // 3. Atomically assign task, create lease, record attempt, update task count
    const attemptNumber = task.attemptCount + 1;
    let leaseId: string;
    let attemptId: string;

    try {
      const initData = await this.prisma.$transaction(async (tx) => {
        // Verify task has not been cancelled concurrently
        const freshTask = await tx.task.findUnique({
          where: { id: taskId },
          select: { status: true },
        });

        if (!freshTask || TaskStateMachine.isTerminal(freshTask.status)) {
          throw new Error(`Task ${taskId} is no longer eligible (status: ${freshTask?.status})`);
        }

        // Increment account active task count safely
        const slotAcquired = await this.accountService.incrementTaskCount(selectedAccount.id, tx);
        if (!slotAcquired) {
          throw new Error(`Account ${selectedAccount.id} reached maximum concurrency`);
        }

        // Create TaskAttempt
        const attempt = await tx.taskAttempt.create({
          data: {
            taskId,
            tenantId,
            accountId: selectedAccount.id,
            attemptNumber,
            status: 'RUNNING',
            startedAt: new Date(),
          },
        });

        // Create Lease
        const lease = await this.leaseService.createLease(
          taskId,
          tenantId,
          selectedAccount.id,
          this.workerHostId,
          30,
          tx,
        );

        // Update task to RUNNING
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.RUNNING,
            assignedAccountId: selectedAccount.id,
            attemptCount: attemptNumber,
          },
        });

        // Record events
        await tx.taskEvent.create({
          data: {
            taskId,
            tenantId,
            accountId: selectedAccount.id,
            eventType: TaskEventType.ACCOUNT_SELECTED,
            metadata: { reason: selectionReason },
          },
        });

        await tx.taskEvent.create({
          data: {
            taskId,
            tenantId,
            accountId: selectedAccount.id,
            attemptId: attempt.id,
            eventType: TaskEventType.TASK_STARTED,
            metadata: { attemptNumber, leaseId: lease.id },
          },
        });

        return { leaseId: lease.id, attemptId: attempt.id };
      });

      leaseId = initData.leaseId;
      attemptId = initData.attemptId;
    } catch (assignError) {
      this.logger.error(`Failed to assign task ${taskId} atomically: ${assignError.message}`, assignError.stack, logCtx);
      return;
    }

    // 4. Setup periodic lease renewal heartbeat during execution
    const heartbeatTimer = setInterval(() => {
      this.leaseService.renewLease(taskId, leaseId, 30).catch((err) => {
        this.logger.warn(`Failed to renew lease for task ${taskId}: ${err.message}`);
      });
    }, 10000);

    let result;
    try {
      // 5. Execute via Telegram MTProto bridge
      result = await this.telegramExecutor.execute(task, selectedAccount);
    } catch (execError) {
      result = {
        success: false,
        errorCode: ErrorCode.UNKNOWN_ERROR,
        errorMessage: execError.message,
        durationMs: 0,
      };
    } finally {
      clearInterval(heartbeatTimer);
    }

    // 6. Duplicate execution protection: Validate lease before accepting results
    const isLeaseValid = await this.leaseService.validateLease(taskId, leaseId);
    if (!isLeaseValid) {
      this.logger.error(
        `STALE WORKER DETECTED! Lease ${leaseId} for task ${taskId} is no longer valid. Rejecting results.`,
        undefined,
        logCtx,
      );
      // Clean up account concurrency count
      await this.accountService.decrementTaskCount(selectedAccount.id);
      return;
    }

    // 7. Handle Success or Failure
    if (result.success) {
      await this.handleTaskSuccess(task, selectedAccount, leaseId, attemptId, result);
    } else {
      await this.handleTaskFailure(task, selectedAccount, leaseId, attemptId, result, attemptNumber);
    }
  }

  private async handleTaskSuccess(task: any, account: any, leaseId: string, attemptId: string, result: any) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Complete Task
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.COMPLETED,
          result: result.data || {},
          completedAt: now,
          leaseId: null,
          leaseExpiresAt: null,
        },
      });

      // Update TaskAttempt
      await tx.taskAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'SUCCESS',
          finishedAt: now,
          durationMs: result.durationMs,
        },
      });

      // Revoke lease
      await this.leaseService.revokeLease(task.id, leaseId, tx);

      // Decrement account task count
      await this.accountService.decrementTaskCount(account.id, tx);

      // Record account success
      await this.accountHealthService.recordSuccess(account.id, tx);

      // Record TaskEvent
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          tenantId: task.tenantId,
          accountId: account.id,
          attemptId,
          eventType: TaskEventType.TASK_COMPLETED,
          metadata: { durationMs: result.durationMs },
        },
      });
    });

    if (task.jobId) {
      await this.jobService.incrementJobProgress(task.jobId, true);
    }

    this.logger.log(`Task ${task.id} COMPLETED successfully`, { taskId: task.id, accountId: account.id });
  }

  private async handleTaskFailure(
    task: any,
    account: any,
    leaseId: string,
    attemptId: string,
    result: any,
    attemptNumber: number,
  ) {
    const failure = this.failureClassifier.classify(result.errorCode, result.floodWaitSeconds);
    const now = new Date();

    // 1. Record failure on account
    await this.accountHealthService.recordFailure(account.id, failure, result.errorMessage);

    // 2. Update TaskAttempt record
    await this.prisma.taskAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'FAILED',
        errorCode: failure.errorCode,
        errorMessage: result.errorMessage,
        rawError: result.rawError,
        durationMs: result.durationMs,
        finishedAt: now,
      },
    });

    // 3. Decrement account concurrency count and revoke lease
    await this.prisma.$transaction(async (tx) => {
      await this.leaseService.revokeLease(task.id, leaseId, tx);
      await this.accountService.decrementTaskCount(account.id, tx);
    });

    const isRetryable = failure.isRetryableTask && this.retryService.isRetryable(attemptNumber, task.maxAttempts);

    if (!isRetryable) {
      // Task permanently FAILED
      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.FAILED,
            lastError: result.errorMessage,
            lastErrorCode: failure.errorCode,
            leaseId: null,
            leaseExpiresAt: null,
          },
        }),
        this.prisma.taskEvent.create({
          data: {
            taskId: task.id,
            tenantId: task.tenantId,
            accountId: account.id,
            attemptId,
            eventType: TaskEventType.TASK_FAILED,
            metadata: {
              errorCode: failure.errorCode,
              errorMessage: result.errorMessage,
              attemptNumber,
              maxAttempts: task.maxAttempts,
            },
          },
        }),
      ]);

      if (task.jobId) {
        await this.jobService.incrementJobProgress(task.jobId, false);
      }

      this.logger.error(`Task ${task.id} FAILED permanently (${failure.errorCode}): ${result.errorMessage}`);
      return;
    }

    // Task is retryable!
    if (failure.isAccountFailure) {
      // Account problem -> Reassign to another account
      this.logger.warn(`Account failed for task ${task.id}, marking REASSIGNABLE`);
      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.REASSIGNABLE,
            assignedAccountId: null, // Clear account so another is selected
            lastError: result.errorMessage,
            lastErrorCode: failure.errorCode,
          },
        }),
        this.prisma.taskEvent.create({
          data: {
            taskId: task.id,
            tenantId: task.tenantId,
            accountId: account.id,
            attemptId,
            eventType: TaskEventType.TASK_REASSIGNABLE,
            metadata: { reason: `Account failure: ${failure.errorCode}` },
          },
        }),
      ]);

      // Re-enqueue immediately so another account can take it
      await this.taskService.enqueueTask(task.id, 1000);
    } else {
      // Temporary network/timeout error -> calculate exponential backoff delay
      const retryDelay = this.retryService.calculateBackoffDelay(task.attemptCount);
      const nextScheduledAt = new Date(Date.now() + retryDelay);

      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.RETRY_WAIT,
            scheduledAt: nextScheduledAt,
            lastError: result.errorMessage,
            lastErrorCode: failure.errorCode,
          },
        }),
        this.prisma.taskEvent.create({
          data: {
            taskId: task.id,
            tenantId: task.tenantId,
            accountId: account.id,
            attemptId,
            eventType: TaskEventType.TASK_REQUEUED,
            metadata: {
              retryDelayMs: retryDelay,
              attemptNumber: task.attemptCount,
              nextScheduledAt: nextScheduledAt.toISOString(),
            },
          },
        }),
      ]);

      this.logger.log(`Task ${task.id} scheduled for retry in ${retryDelay}ms`);
      await this.taskService.enqueueTask(task.id, retryDelay);
    }
  }
}
