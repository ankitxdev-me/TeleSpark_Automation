import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { TaskLease, TaskStatus } from '@prisma/client';
import { TaskEventType } from '../common/constants/events.constant';

@Injectable()
export class LeaseService {
  private readonly defaultDurationSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(LeaseService.name);
    this.defaultDurationSeconds = this.configService.get<number>('lease.defaultDurationSeconds', 30);
  }

  /**
   * Creates a new lease atomically inside a transaction or standalone.
   */
  async createLease(
    taskId: string,
    tenantId: string,
    accountId: string,
    workerId: string,
    durationSeconds: number = this.defaultDurationSeconds,
    tx?: any,
  ): Promise<TaskLease> {
    const db = tx || this.prisma;
    const leaseId = uuidv4();
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    const lease = await db.taskLease.create({
      data: {
        id: leaseId,
        taskId,
        tenantId,
        accountId,
        workerId,
        expiresAt,
        isRevoked: false,
        renewedAt: new Date(),
      },
    });

    // Update task with the lease details
    await db.task.update({
      where: { id: taskId },
      data: {
        leaseId,
        leaseExpiresAt: expiresAt,
      },
    });

    this.logger.log(`Created lease ${leaseId} for task ${taskId} (expires in ${durationSeconds}s)`, {
      taskId,
      leaseId,
      accountId,
      workerId,
      expiresAt: expiresAt.toISOString(),
    });

    return lease;
  }

  /**
   * Validates if a worker's lease is currently valid and active.
   */
  async validateLease(taskId: string, leaseId: string): Promise<boolean> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { leaseId: true, leaseExpiresAt: true, status: true },
    });

    if (!task) return false;
    if (task.leaseId !== leaseId) return false;
    if (!task.leaseExpiresAt || task.leaseExpiresAt.getTime() <= Date.now()) return false;

    const leaseRecord = await this.prisma.taskLease.findUnique({
      where: { id: leaseId },
    });

    return !!(leaseRecord && !leaseRecord.isRevoked);
  }

  /**
   * Renews an active lease for long-running operations.
   */
  async renewLease(
    taskId: string,
    leaseId: string,
    extendSeconds: number = this.defaultDurationSeconds,
  ): Promise<boolean> {
    const isValid = await this.validateLease(taskId, leaseId);
    if (!isValid) {
      this.logger.warn(`Cannot renew invalid or expired lease ${leaseId} for task ${taskId}`, {
        taskId,
        leaseId,
      });
      return false;
    }

    const newExpiresAt = new Date(Date.now() + extendSeconds * 1000);

    await this.prisma.$transaction([
      this.prisma.taskLease.update({
        where: { id: leaseId },
        data: {
          expiresAt: newExpiresAt,
          renewedAt: new Date(),
        },
      }),
      this.prisma.task.update({
        where: { id: taskId },
        data: {
          leaseExpiresAt: newExpiresAt,
        },
      }),
      this.prisma.taskEvent.create({
        data: {
          taskId,
          tenantId: (await this.prisma.task.findUnique({ where: { id: taskId }, select: { tenantId: true } })).tenantId,
          eventType: TaskEventType.LEASE_RENEWED,
          metadata: { leaseId, newExpiresAt },
        },
      }),
    ]);

    this.logger.debug(`Renewed lease ${leaseId} for task ${taskId}`, { taskId, leaseId, newExpiresAt });
    return true;
  }

  /**
   * Revokes an existing lease.
   */
  async revokeLease(taskId: string, leaseId?: string, tx?: any): Promise<void> {
    const db = tx || this.prisma;
    if (leaseId) {
      await db.taskLease.updateMany({
        where: { id: leaseId },
        data: { isRevoked: true },
      });
    }

    await db.task.update({
      where: { id: taskId },
      data: {
        leaseId: null,
        leaseExpiresAt: null,
      },
    });

    this.logger.log(`Revoked lease for task ${taskId}`, { taskId, leaseId });
  }

  /**
   * Scans for expired leases and marks tasks as REASSIGNABLE to prevent stuck tasks.
   */
  async recoverExpiredLeases(): Promise<number> {
    const now = new Date();
    const expiredTasks = await this.prisma.task.findMany({
      where: {
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.RUNNING] },
        leaseExpiresAt: { lt: now },
      },
      include: { assignedAccount: true },
    });

    if (expiredTasks.length === 0) return 0;

    let recoveredCount = 0;
    for (const task of expiredTasks) {
      await this.prisma.$transaction(async (tx) => {
        // Mark lease revoked
        if (task.leaseId) {
          await tx.taskLease.updateMany({
            where: { id: task.leaseId },
            data: { isRevoked: true },
          });
        }

        // Release account task count
        if (task.assignedAccountId) {
          await tx.account.update({
            where: { id: task.assignedAccountId },
            data: {
              currentTaskCount: {
                decrement: 1,
              },
            },
          });
        }

        // Transition task to REASSIGNABLE
        await tx.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.REASSIGNABLE,
            leaseId: null,
            leaseExpiresAt: null,
            assignedAccountId: null,
          },
        });

        // Record audit event
        await tx.taskEvent.create({
          data: {
            taskId: task.id,
            tenantId: task.tenantId,
            accountId: task.assignedAccountId,
            eventType: TaskEventType.TASK_REASSIGNABLE,
            metadata: {
              reason: 'Lease expired without worker renewal',
              previousLeaseId: task.leaseId,
              expiredAt: task.leaseExpiresAt,
            },
          },
        });
      });

      recoveredCount++;
      this.logger.warn(`Recovered expired task ${task.id} -> marked REASSIGNABLE`, {
        taskId: task.id,
        tenantId: task.tenantId,
        previousLeaseId: task.leaseId,
      });
    }

    return recoveredCount;
  }
}
