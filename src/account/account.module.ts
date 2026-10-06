import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountHealthService } from './account-health.service';
import { AccountSelectionService } from './account-selection.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  providers: [
    AccountService,
    AccountHealthService,
    AccountSelectionService,
    AppLogger,
  ],
  exports: [
    AccountService,
    AccountHealthService,
    AccountSelectionService,
  ],
})
export class AccountModule {}
