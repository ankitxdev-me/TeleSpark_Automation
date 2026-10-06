import { Module } from '@nestjs/common';
import { FailureClassifierService } from './failure-classifier.service';

@Module({
  providers: [FailureClassifierService],
  exports: [FailureClassifierService],
})
export class FailureModule {}
