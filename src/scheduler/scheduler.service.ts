import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { LeaseService } from '../lease/lease.service';
import { TaskService } from '../task/task.service';
import { TaskStatus, TaskPriority } from '@prisma/client';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
    private readonly leaseService: LeaseService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(SchedulerService.name);
  }

  onModuleInit() {
    // Run scheduler sweep every 5 seconds
    this.timer = setInterval(() => {
      this.runPeriodicSweep().catch((err) => {
        this.logger.error(`Periodic sweep error: ${err.message}`, err.stack);
      });
    }, 5000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Periodic sweep recovering expired leases and ensuring due tasks are queued in BullMQ.
   */
  async runPeriodicSweep(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      // 1. Recover expired leases
      const recoveredLeases = await this.leaseService.recoverExpiredLeases();
      if (recoveredLeases > 0) {
        this.logger.log(`Recovered ${recoveredLeases} expired task leases`);
      }

      // 2. Select eligible tasks that should be queued
      // Statuses: QUEUED, RETRY_WAIT, REASSIGNABLE where scheduledAt <= now
      const now = new Date();
      const eligibleTasks = await this.prisma.task.findMany({
        where: {
          status: {
            in: [TaskStatus.QUEUED, TaskStatus.RETRY_WAIT, TaskStatus.REASSIGNABLE],
          },
          scheduledAt: { lte: now },
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' },
        ],
        take: 50,
      });

      for (const task of eligibleTasks) {
        // If task was in RETRY_WAIT or REASSIGNABLE, transition to QUEUED
        if (task.status === TaskStatus.RETRY_WAIT || task.status === TaskStatus.REASSIGNABLE) {
          await this.prisma.task.update({
            where: { id: task.id },
            data: { status: TaskStatus.QUEUED },
          });
        }

        // Re-dispatch into BullMQ queue
        await this.taskService.enqueueTask(task.id, 0);
      }
    } finally {
      this.isSweeping = false;
    }
  }
}
