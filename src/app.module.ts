import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { PrismaModule } from './database/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { TelegramModule } from './telegram/telegram.module';
import { FailureModule } from './failure/failure.module';
import { RetryModule } from './retry/retry.module';
import { LeaseModule } from './lease/lease.module';
import { AccountModule } from './account/account.module';
import { TaskModule } from './task/task.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { JobModule } from './job/job.module';
import { WorkerModule } from './worker/worker.module';
import { HealthModule } from './health/health.module';
import { ApiModule } from './api/api.module';
import { UserModule } from './user/user.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppLogger } from './common/logger/app-logger.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)', '/docs/(.*)'],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db', 0),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    TenantModule,
    AuthModule,
    TelegramModule,
    FailureModule,
    RetryModule,
    LeaseModule,
    AccountModule,
    TaskModule,
    SchedulerModule,
    JobModule,
    WorkerModule,
    HealthModule,
    ApiModule,
    UserModule,
  ],
  providers: [AppLogger],
})
export class AppModule {}
