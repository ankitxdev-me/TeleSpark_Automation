import { Module, forwardRef } from '@nestjs/common';
import { TaskExecutionProcessor } from './task-execution.processor';
import { AccountModule } from '../account/account.module';
import { LeaseModule } from '../lease/lease.module';
import { FailureModule } from '../failure/failure.module';
import { RetryModule } from '../retry/retry.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TaskModule } from '../task/task.module';
import { JobModule } from '../job/job.module';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  imports: [
    AccountModule,
    LeaseModule,
    FailureModule,
    RetryModule,
    TelegramModule,
    forwardRef(() => TaskModule),
    forwardRef(() => JobModule),
  ],
  providers: [TaskExecutionProcessor, AppLogger],
  exports: [TaskExecutionProcessor],
})
export class WorkerModule {}
