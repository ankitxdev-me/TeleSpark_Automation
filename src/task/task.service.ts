import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { Task, TaskPriority, TaskStatus, Prisma } from '@prisma/client';
import { CreateTaskDto } from './dtos/create-task.dto';
import { QueryTasksDto } from './dtos/query-tasks.dto';
import { TaskStateMachine } from './state-machine/task-state-machine';
import { TaskEventType } from '../common/constants/events.constant';
import { QUEUE_NAMES, JOB_NAMES } from '../common/constants/queues.constant';
import { TASK_CAPABILITY_MAP, TaskType } from '../common/constants/task-types.constant';
import { LeaseService } from '../lease/lease.service';
import { AccountService } from '../account/account.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaseService: LeaseService,
    @Inject(forwardRef(() => AccountService))
    private readonly accountService: AccountService,
    @InjectQueue(QUEUE_NAMES.TELEGRAM_TASKS)
    private readonly taskQueue: Queue,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(TaskService.name);
  }

  /**
   * Translates TaskPriority to BullMQ numeric priority (lower number = higher priority).
   */
  private getBullPriority(priority: TaskPriority): number {
    switch (priority) {
      case TaskPriority.CRITICAL:
        return 1;
      case TaskPriority.HIGH:
        return 2;
      case TaskPriority.NORMAL:
        return 5;
      case TaskPriority.LOW:
        return 10;
      default:
        return 5;
    }
  }

  /**
   * Creates a new task and dispatches it to BullMQ.
   */
  async create(tenantId: string, dto: CreateTaskDto, jobId?: string): Promise<Task> {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.task.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (existing) {
        this.logger.log(`Idempotent hit for task key ${dto.idempotencyKey}`, {
          taskId: existing.id,
          idempotencyKey: dto.idempotencyKey,
        });
        return existing;
      }
    }

    // 2. Validate assignedAccountId if provided
    if (dto.assignedAccountId) {
      const acc = await this.prisma.account.findFirst({
        where: { id: dto.assignedAccountId, tenantId },
      });
      if (!acc) {
        throw new BadRequestException(`Assigned account ${dto.assignedAccountId} does not exist in tenant`);
      }
    }

    const scheduledDate = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
    const requiredCapability = dto.requiredCapability || TASK_CAPABILITY_MAP[dto.type] || 'canSendMessage';
    const priority = dto.priority || TaskPriority.NORMAL;

    // 3. Atomically create Task and TASK_CREATED event in PostgreSQL
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          tenantId,
          jobId,
          idempotencyKey: dto.idempotencyKey,
          type: dto.type,
          payload: dto.payload as Prisma.InputJsonValue,
          priority,
          status: TaskStatus.QUEUED,
          requiredCapability,
          assignedAccountId: dto.assignedAccountId,
          maxAttempts: dto.maxAttempts || 5,
          scheduledAt: scheduledDate,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          tenantId,
          eventType: TaskEventType.TASK_CREATED,
          metadata: {
            priority,
            type: dto.type,
            scheduledAt: scheduledDate.toISOString(),
          },
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          tenantId,
          eventType: TaskEventType.TASK_QUEUED,
        },
      });

      return created;
    });

    // 4. Calculate delay if task is scheduled for future
    const now = Date.now();
    const delay = Math.max(0, scheduledDate.getTime() - now);

    // 5. Enqueue into BullMQ with job options
    await this.taskQueue.add(
      JOB_NAMES.EXECUTE_TASK,
      { taskId: task.id, tenantId },
      {
        jobId: task.id, // Ensures one job per task in queue
        priority: this.getBullPriority(task.priority),
        delay,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(`Task ${task.id} created and queued (delay: ${delay}ms)`, {
      taskId: task.id,
      tenantId,
      priority: task.priority,
      jobId,
    });

    return task;
  }

  async findOne(tenantId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId },
      include: {
        assignedAccount: true,
        attempts: { orderBy: { startedAt: 'desc' } },
        events: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    return task;
  }

  async findAll(tenantId: string, query: QueryTasksDto) {
    const { status, priority, jobId, assignedAccountId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(jobId ? { jobId } : {}),
      ...(assignedAccountId ? { assignedAccountId } : {}),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Cancels a pending or queued task.
   */
  async cancel(tenantId: string, id: string, reason?: string): Promise<Task> {
    const task = await this.findOne(tenantId, id);

    if (!TaskStateMachine.isCancellable(task.status)) {
      throw new BadRequestException(
        `Task ${id} cannot be cancelled because its current status is '${task.status}'`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Revoke any lease
      if (task.leaseId) {
        await tx.taskLease.updateMany({
          where: { id: task.leaseId },
          data: { isRevoked: true },
        });
      }

      // Decrement account concurrency count if assigned
      if (task.assignedAccountId) {
        await this.accountService.decrementTaskCount(task.assignedAccountId, tx);
      }

      const cancelled = await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.CANCELLED,
          leaseId: null,
          leaseExpiresAt: null,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          tenantId,
          eventType: TaskEventType.TASK_CANCELLED,
          metadata: { reason: reason || 'Cancelled by client' },
        },
      });

      return cancelled;
    });

    // Remove from BullMQ queue if present
    try {
      const bullJob = await this.taskQueue.getJob(task.id);
      if (bullJob) {
        await bullJob.remove();
      }
    } catch (e) {
      this.logger.debug(`Could not remove job ${task.id} from queue: ${e.message}`);
    }

    this.logger.log(`Task ${task.id} cancelled`, { taskId: task.id, tenantId });
    return updated;
  }

  /**
   * Requeues an eligible task back into BullMQ.
   */
  async enqueueTask(taskId: string, delayMs: number = 0): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || TaskStateMachine.isTerminal(task.status)) {
      return;
    }

    await this.taskQueue.add(
      JOB_NAMES.EXECUTE_TASK,
      { taskId: task.id, tenantId: task.tenantId },
      {
        jobId: `${task.id}-${Date.now()}`,
        priority: this.getBullPriority(task.priority),
        delay: delayMs,
        removeOnComplete: true,
      },
    );

    this.logger.log(`Re-enqueued task ${taskId} with delay ${delayMs}ms`, {
      taskId,
      priority: task.priority,
    });
  }
}
