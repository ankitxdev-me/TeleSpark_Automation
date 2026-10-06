import { Module, forwardRef } from '@nestjs/common';
import { JobService } from './job.service';
import { TaskModule } from '../task/task.module';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  imports: [forwardRef(() => TaskModule)],
  providers: [JobService, AppLogger],
  exports: [JobService],
})
export class JobModule {}
