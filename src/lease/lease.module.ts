import { Module } from '@nestjs/common';
import { LeaseService } from './lease.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  providers: [LeaseService, AppLogger],
  exports: [LeaseService],
})
export class LeaseModule {}
