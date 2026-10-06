import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { AccountService } from '../../account/account.service';
import { CreateAccountDto } from '../../account/dtos/create-account.dto';
import { SendCodeDto } from '../../account/dtos/send-code.dto';
import { VerifyCodeDto } from '../../account/dtos/verify-code.dto';
import { UpdateAccountDto } from '../../account/dtos/update-account.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { Tenant, AccountStatus } from '@prisma/client';

@ApiTags('Accounts')
@ApiSecurity('apiKey')
@Controller('accounts')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN') // Defensive: Only ADMIN can view, add, modify, or delete Telegram accounts!
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Interactive Step 1: Request Telegram login OTP for a phone number',
    description: 'Connects to Telegram MTProto and dispatches a 5-digit verification code to the phone/app.',
  })
  @ApiResponse({ status: 200, description: 'Verification code sent successfully' })
  async sendCode(@CurrentTenant() tenant: Tenant, @Body() dto: SendCodeDto) {
    return this.accountService.sendCode(tenant.id, dto);
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Interactive Step 2: Verify OTP (+ optional 2FA) and register the account',
    description: 'Submits verification code, completes MTProto authorization, and saves account to PostgreSQL as ACTIVE.',
  })
  @ApiResponse({ status: 200, description: 'Account authorized and registered' })
  async verifyCode(@CurrentTenant() tenant: Tenant, @Body() dto: VerifyCodeDto) {
    return this.accountService.verifyCode(tenant.id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Live test whether an account session is still valid on Telegram' })
  @ApiResponse({ status: 200, description: 'Session test result returned' })
  async testSession(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.testSession(tenant.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Directly register an account with a pre-existing StringSession' })
  @ApiResponse({ status: 201, description: 'Account registered successfully' })
  async create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateAccountDto) {
    const account = await this.accountService.create(tenant.id, dto);
    return this.accountService.sanitize(account);
  }

  @Get()
  @ApiOperation({ summary: 'List all accounts for the current tenant' })
  @ApiQuery({ name: 'status', enum: AccountStatus, required: false })
  async findAll(@CurrentTenant() tenant: Tenant, @Query('status') status?: AccountStatus) {
    return this.accountService.findAll(tenant.id, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account details' })
  async findOne(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.findOneSanitized(tenant.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account settings (username label, concurrency, status)' })
  async update(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an account and its sessions from the system' })
  async delete(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.delete(tenant.id, id);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Get account health metrics, failure stats, and cooldown status' })
  async getHealth(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.getHealth(tenant.id, id);
  }

  @Get(':id/capabilities')
  @ApiOperation({ summary: 'Get account operational capabilities' })
  async getCapabilities(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.getCapabilities(tenant.id, id);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually enable an account' })
  async enable(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.enable(tenant.id, id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually disable an account' })
  async disable(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.accountService.disable(tenant.id, id);
  }
}
