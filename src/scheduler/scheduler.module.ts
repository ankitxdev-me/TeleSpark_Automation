import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { TaskModule } from '../task/task.module';
import { LeaseModule } from '../lease/lease.module';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  imports: [TaskModule, LeaseModule],
  providers: [SchedulerService, AppLogger],
  exports: [SchedulerService],
})
export class SchedulerModule {}
