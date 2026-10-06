import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  providers: [TenantService, AppLogger],
  exports: [TenantService],
})
export class TenantModule {}
