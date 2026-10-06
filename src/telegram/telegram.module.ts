import { Module } from '@nestjs/common';
import { TelegramTaskExecutorService } from './telegram-task-executor.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Module({
  providers: [TelegramTaskExecutorService, AppLogger],
  exports: [TelegramTaskExecutorService],
})
export class TelegramModule {}
