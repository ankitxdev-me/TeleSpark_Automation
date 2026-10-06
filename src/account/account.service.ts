import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { Account, AccountCapability, AccountHealth, AccountStatus } from '@prisma/client';
import { CreateAccountDto } from './dtos/create-account.dto';
import { SendCodeDto } from './dtos/send-code.dto';
import { VerifyCodeDto } from './dtos/verify-code.dto';
import { UpdateAccountDto } from './dtos/update-account.dto';

@Injectable()
export class AccountService {
  private readonly tempSessions = new Map<string, { tempSession: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AccountService.name);
  }

  private async executeAuthAction(action: string, payload: any): Promise<any> {
    const pythonPath = process.env.PYTHON_EXECUTOR_PATH || 'python';
    const scriptPath = path.resolve(process.cwd(), 'python/telegram_auth.py');

    return new Promise((resolve, reject) => {
      const child = spawn(pythonPath, [scriptPath, action], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', () => {
        try {
          const res = JSON.parse(stdout.trim());
          resolve(res);
        } catch (e) {
          reject(new Error(`Failed to parse auth bridge output: ${stdout || stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });
  }

  async sendCode(tenantId: string, dto: SendCodeDto): Promise<any> {
    const apiId = dto.apiId || parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const apiHash = dto.apiHash || process.env.TELEGRAM_API_HASH || '';

    this.logger.log(`Requesting Telegram login code for ${dto.phone}`, { tenantId, phone: dto.phone });

    const result = await this.executeAuthAction('send_code', {
      phone: dto.phone,
      apiId,
      apiHash,
    });

    if (!result.success) {
      throw new BadRequestException(result.errorMessage || 'Failed to dispatch login code from Telegram');
    }

    // Cache the temporary session in-memory for 10 minutes
    this.tempSessions.set(dto.phone, {
      tempSession: result.tempSession,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    return {
      success: true,
      phone: dto.phone,
      phoneCodeHash: result.phoneCodeHash,
      timeout: result.timeout || 300,
      message: 'Verification code sent successfully to Telegram app/SMS',
    };
  }

  async verifyCode(tenantId: string, dto: VerifyCodeDto): Promise<any> {
    const cached = this.tempSessions.get(dto.phone);
    if (!cached || cached.expiresAt < Date.now()) {
      throw new BadRequestException('Verification session expired. Please request a new code.');
    }

    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    const result = await this.executeAuthAction('verify_code', {
      phone: dto.phone,
      code: dto.code,
      phoneCodeHash: dto.phoneCodeHash,
      password: dto.password,
      tempSession: cached.tempSession,
      apiId,
      apiHash,
    });

    if (!result.success) {
      if (result.requires2FA) {
        if (result.tempSession) {
          this.tempSessions.set(dto.phone, {
            tempSession: result.tempSession,
            expiresAt: Date.now() + 10 * 60 * 1000,
          });
        }
        return {
          success: false,
          requires2FA: true,
          message: result.errorMessage || 'Two-Step Verification (2FA) password is required',
        };
      }
      throw new BadRequestException(result.errorMessage || 'Invalid verification code');
    }

    // Auth succeeded! Upsert account in PostgreSQL
    const existing = await this.prisma.account.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone: dto.phone,
        },
      },
    });

    let account: Account;
    const username = dto.username || result.user?.username || `user_${result.user?.id || Date.now()}`;

    if (existing) {
      account = await this.prisma.account.update({
        where: { id: existing.id },
        data: {
          sessionString: result.sessionString,
          username,
          status: AccountStatus.ACTIVE,
          maxConcurrency: dto.maxConcurrency || existing.maxConcurrency || 1,
        },
        include: { capability: true, health: true },
      });
      await this.prisma.accountHealth.updateMany({
        where: { accountId: existing.id },
        data: { healthScore: 100.0, consecutiveFailures: 0, cooldownUntil: null },
      });
    } else {
      account = await this.prisma.$transaction(async (tx) => {
        const created = await tx.account.create({
          data: {
            tenantId,
            phone: dto.phone,
            username,
            sessionString: result.sessionString,
            apiId,
            apiHash,
            maxConcurrency: dto.maxConcurrency || 1,
            status: AccountStatus.ACTIVE,
          },
        });

        await tx.accountCapability.create({
          data: {
            accountId: created.id,
            canSendMessage: true,
            canReplyMessage: true,
            canComment: true,
            canReaction: true,
            canJoinChat: true,
            canLeaveChat: true,
            canForwardMessage: true,
            canSendMedia: true,
            canEditMessage: true,
            canDeleteMessage: true,
            canGetMessages: true,
            canGetChatInfo: true,
            canGetMembers: true,
            canGetAdmins: true,
            canGroupOperation: true,
            canChannelOperation: true,
          },
        });

        await tx.accountHealth.create({
          data: {
            accountId: created.id,
            healthScore: 100.0,
          },
        });

        return tx.account.findUnique({
          where: { id: created.id },
          include: { capability: true, health: true },
        }) as Promise<Account>;
      });
    }

    this.tempSessions.delete(dto.phone);

    this.logger.log(`Account ${account.id} (${dto.phone}) authorized and registered`, {
      tenantId,
      accountId: account.id,
      phone: dto.phone,
    });

    return {
      success: true,
      account: this.sanitize(account),
      user: result.user,
    };
  }

  async testSession(tenantId: string, id: string): Promise<any> {
    const account = await this.findOne(tenantId, id);
    if (!account.sessionString) {
      return { valid: false, status: 'NO_SESSION', message: 'Account does not have a session string configured' };
    }

    const apiId = account.apiId || parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const apiHash = account.apiHash || process.env.TELEGRAM_API_HASH || '';

    const result = await this.executeAuthAction('test_session', {
      sessionString: account.sessionString,
      apiId,
      apiHash,
    });

    if (result.valid) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { status: AccountStatus.ACTIVE },
      });
      await this.prisma.accountHealth.updateMany({
        where: { accountId: account.id },
        data: { healthScore: 100.0, consecutiveFailures: 0 },
      });
    } else {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { status: AccountStatus.DISABLED },
      });
    }

    return result;
  }

  async update(tenantId: string, id: string, dto: UpdateAccountDto): Promise<any> {
    const account = await this.findOne(tenantId, id);
    const updated = await this.prisma.account.update({
      where: { id: account.id },
      data: {
        ...(dto.username ? { username: dto.username } : {}),
        ...(dto.maxConcurrency ? { maxConcurrency: dto.maxConcurrency } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: {
        capability: true,
        health: true,
      },
    });
    return this.sanitize(updated);
  }

  async delete(tenantId: string, id: string): Promise<any> {
    const account = await this.findOne(tenantId, id);
    await this.prisma.account.delete({
      where: { id: account.id },
    });
    this.logger.log(`Deleted account ${id}`, { tenantId, accountId: id });
    return { success: true, message: `Account ${id} removed successfully` };
  }

  async create(tenantId: string, dto: CreateAccountDto): Promise<Account> {
    const existing = await this.prisma.account.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone: dto.phone,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Account with phone ${dto.phone} already exists in tenant`);
    }

    const { capabilities, ...accountData } = dto;

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          tenantId,
          phone: accountData.phone,
          username: accountData.username,
          sessionString: accountData.sessionString,
          apiId: accountData.apiId,
          apiHash: accountData.apiHash,
          maxConcurrency: accountData.maxConcurrency || 1,
          status: AccountStatus.ACTIVE,
        },
      });

      // Initialize capability
      await tx.accountCapability.create({
        data: {
          accountId: created.id,
          ...(capabilities || {}),
        },
      });

      // Initialize health
      await tx.accountHealth.create({
        data: {
          accountId: created.id,
          healthScore: 100.0,
        },
      });

      return created;
    });

    this.logger.log(`Created account ${account.id} for phone ${dto.phone}`, {
      tenantId,
      accountId: account.id,
    });

    return account;
  }

  sanitize(account: any): any {
    if (!account) return null;
    const { sessionString, apiHash, ...sanitized } = account;
    return {
      ...sanitized,
      hasSessionConfigured: Boolean(sessionString),
      apiHashConfigured: Boolean(apiHash),
    };
  }

  async findAll(tenantId: string, status?: AccountStatus): Promise<any[]> {
    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        capability: true,
        health: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return accounts.map((acc) => this.sanitize(acc));
  }

  async findOne(tenantId: string, id: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId },
      include: {
        capability: true,
        health: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    return account;
  }

  async findOneSanitized(tenantId: string, id: string): Promise<any> {
    const account = await this.findOne(tenantId, id);
    return this.sanitize(account);
  }

  async getHealth(tenantId: string, id: string): Promise<AccountHealth> {
    const account = await this.findOne(tenantId, id);
    const health = await this.prisma.accountHealth.findUnique({
      where: { accountId: account.id },
    });

    if (!health) {
      throw new NotFoundException(`Health record for account ${id} not found`);
    }

    return health;
  }

  async getCapabilities(tenantId: string, id: string): Promise<AccountCapability> {
    const account = await this.findOne(tenantId, id);
    const capabilities = await this.prisma.accountCapability.findUnique({
      where: { accountId: account.id },
    });

    if (!capabilities) {
      throw new NotFoundException(`Capabilities record for account ${id} not found`);
    }

    return capabilities;
  }

  async enable(tenantId: string, id: string): Promise<any> {
    const account = await this.findOne(tenantId, id);
    const updated = await this.prisma.account.update({
      where: { id: account.id },
      data: { status: AccountStatus.ACTIVE },
      include: { capability: true, health: true },
    });

    this.logger.log(`Enabled account ${id}`, { tenantId, accountId: id });
    return this.sanitize(updated);
  }

  async disable(tenantId: string, id: string): Promise<any> {
    const account = await this.findOne(tenantId, id);
    const updated = await this.prisma.account.update({
      where: { id: account.id },
      data: { status: AccountStatus.DISABLED },
      include: { capability: true, health: true },
    });

    this.logger.log(`Disabled account ${id}`, { tenantId, accountId: id });
    return this.sanitize(updated);
  }

  async incrementTaskCount(accountId: string, tx?: any): Promise<boolean> {
    const db = tx || this.prisma;
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: { currentTaskCount: true, maxConcurrency: true },
    });

    if (!account || account.currentTaskCount >= account.maxConcurrency) {
      return false;
    }

    await db.account.update({
      where: { id: accountId },
      data: {
        currentTaskCount: { increment: 1 },
      },
    });
    return true;
  }

  async decrementTaskCount(accountId: string, tx?: any): Promise<void> {
    const db = tx || this.prisma;
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: { currentTaskCount: true },
    });

    if (account && account.currentTaskCount > 0) {
      await db.account.update({
        where: { id: accountId },
        data: {
          currentTaskCount: { decrement: 1 },
        },
      });
    }
  }
}
