import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthService } from './auth.service';
import { TenantModule } from '../tenant/tenant.module';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [TenantModule, PrismaModule],
  providers: [AuthGuard, RolesGuard, AuthService],
  exports: [AuthGuard, RolesGuard, AuthService],
})
export class AuthModule {}
