import { Module } from '@nestjs/common';
import { TaskController } from './controllers/task.controller';
import { JobController } from './controllers/job.controller';
import { AccountController } from './controllers/account.controller';
import { TenantController } from './controllers/tenant.controller';
import { AuthController } from './controllers/auth.controller';
import { UserController } from './controllers/user.controller';
import { TaskModule } from '../task/task.module';
import { JobModule } from '../job/job.module';
import { AccountModule } from '../account/account.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TaskModule,
    JobModule,
    AccountModule,
    TenantModule,
    AuthModule,
    UserModule,
  ],
  controllers: [
    AuthController,
    UserController,
    TaskController,
    JobController,
    AccountController,
    TenantController,
  ],
})
export class ApiModule {}
