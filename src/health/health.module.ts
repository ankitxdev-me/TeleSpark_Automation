import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../common/constants/queues.constant';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.TELEGRAM_TASKS,
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
