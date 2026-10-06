import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskService } from './task.service';
import { LeaseModule } from '../lease/lease.module';
import { AccountModule } from '../account/account.module';
import { QUEUE_NAMES } from '../common/constants/queues.constant';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.TELEGRAM_TASKS,
    }),
    LeaseModule,
    forwardRef(() => AccountModule),
  ],
  providers: [TaskService, AppLogger],
  exports: [TaskService, BullModule],
})
export class TaskModule {}
