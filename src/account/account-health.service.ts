import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { AccountStatus } from '@prisma/client';
import { ErrorCode, ErrorSeverity } from '../common/constants/error-codes.constant';
import { ClassifiedFailure } from '../failure/failure-classifier.service';

@Injectable()
export class AccountHealthService {
  private readonly defaultCooldownDurationSeconds: number;
  private readonly maxConsecutiveFailures: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AccountHealthService.name);
    this.defaultCooldownDurationSeconds = this.configService.get<number>(
      'account.defaultCooldownSeconds',
      300,
    );
    this.maxConsecutiveFailures = this.configService.get<number>(
      'account.maxConsecutiveFailures',
      5,
    );
  }

  /**
   * Records a successful task execution for an account.
   */
  async recordSuccess(accountId: string, tx?: any): Promise<void> {
    const db = tx || this.prisma;
    const now = new Date();

    const currentHealth = await db.accountHealth.findUnique({ where: { accountId } });
    const currentScore = currentHealth?.healthScore ?? 100.0;
    // Gradually recover health score up to 100
    const newHealthScore = Math.min(100.0, currentScore + 2.0);

    await db.accountHealth.upsert({
      where: { accountId },
      create: {
        accountId,
        successCount: 1,
        consecutiveFailures: 0,
        lastSuccessAt: now,
        healthScore: newHealthScore,
      },
      update: {
        successCount: { increment: 1 },
        consecutiveFailures: 0,
        lastSuccessAt: now,
        healthScore: newHealthScore,
      },
    });

    this.logger.debug(`Recorded success for account ${accountId}, healthScore: ${newHealthScore}`);
  }

  /**
   * Records a task failure against an account and updates health, cooldown, or restriction state.
   */
  async recordFailure(
    accountId: string,
    failure: ClassifiedFailure,
    errorMessage?: string,
    tx?: any,
  ): Promise<void> {
    const db = tx || this.prisma;
    const now = new Date();

    const health = await db.accountHealth.findUnique({ where: { accountId } });
    const consecutive = (health?.consecutiveFailures || 0) + 1;
    const penalty = failure.severity === ErrorSeverity.FATAL_ACCOUNT ? 40 : 10;
    const newScore = Math.max(0, (health?.healthScore || 100) - penalty);

    let nextStatus: AccountStatus = AccountStatus.ACTIVE;
    let cooldownUntil: Date | null = null;
    let cooldownReason: string | null = null;

    if (failure.errorCode === ErrorCode.ACCOUNT_RESTRICTED) {
      nextStatus = AccountStatus.RESTRICTED;
    } else if (
      failure.errorCode === ErrorCode.ACCOUNT_SESSION_INVALID ||
      failure.errorCode === ErrorCode.ACCOUNT_AUTH_REQUIRED
    ) {
      nextStatus = AccountStatus.REAUTH_REQUIRED;
    } else if (failure.requiresAccountCooldown || failure.errorCode === ErrorCode.FLOOD_WAIT) {
      nextStatus = AccountStatus.COOLDOWN;
      // Exponentially increase cooldown on repeated failures
      const multiplier = Math.min(consecutive, 5);
      const seconds = (failure.suggestedCooldownSeconds || this.defaultCooldownDurationSeconds) * multiplier;
      cooldownUntil = new Date(Date.now() + seconds * 1000);
      cooldownReason = `Cooldown due to ${failure.errorCode}: ${errorMessage || 'Rate limit'}`;
    } else if (consecutive >= this.maxConsecutiveFailures) {
      nextStatus = AccountStatus.RESTRICTED;
      this.logger.warn(`Account ${accountId} hit maximum consecutive failures (${consecutive}) -> RESTRICTED`);
    }

    await db.accountHealth.upsert({
      where: { accountId },
      create: {
        accountId,
        failureCount: 1,
        consecutiveFailures: consecutive,
        lastFailureAt: now,
        lastErrorCode: failure.errorCode,
        lastErrorAt: now,
        healthScore: newScore,
        cooldownUntil,
        cooldownReason,
      },
      update: {
        failureCount: { increment: 1 },
        consecutiveFailures: consecutive,
        lastFailureAt: now,
        lastErrorCode: failure.errorCode,
        lastErrorAt: now,
        healthScore: newScore,
        cooldownUntil,
        cooldownReason,
      },
    });

    if (nextStatus !== AccountStatus.ACTIVE) {
      await db.account.update({
        where: { id: accountId },
        data: { status: nextStatus },
      });
      this.logger.warn(`Updated account ${accountId} status to ${nextStatus}`, {
        accountId,
        status: nextStatus,
        cooldownUntil: cooldownUntil?.toISOString(),
        consecutiveFailures: consecutive,
      });
    }
  }

  /**
   * Refreshes cooldown status for accounts whose cooldown duration has passed.
   */
  async processExpiredCooldowns(): Promise<number> {
    const now = new Date();
    const expiredAccounts = await this.prisma.account.findMany({
      where: {
        status: AccountStatus.COOLDOWN,
        health: {
          cooldownUntil: { lte: now },
        },
      },
    });

    for (const acc of expiredAccounts) {
      await this.prisma.$transaction([
        this.prisma.account.update({
          where: { id: acc.id },
          data: { status: AccountStatus.ACTIVE },
        }),
        this.prisma.accountHealth.update({
          where: { accountId: acc.id },
          data: { cooldownUntil: null, cooldownReason: null },
        }),
      ]);
      this.logger.log(`Account ${acc.id} cooldown finished -> restored to ACTIVE`, { accountId: acc.id });
    }

    return expiredAccounts.length;
  }
}
