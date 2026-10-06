import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { Account, AccountCapability, AccountHealth, AccountStatus } from '@prisma/client';
import { AccountHealthService } from './account-health.service';
import { TASK_CAPABILITY_MAP } from '../common/constants/task-types.constant';

export interface AccountSelectionResult {
  selectedAccount: Account | null;
  reason: string;
  evaluatedCandidatesCount: number;
  candidateScores?: { accountId: string; score: number; reason: string }[];
}

@Injectable()
export class AccountSelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: AccountHealthService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AccountSelectionService.name);
  }

  /**
   * Selects the optimal eligible account for a task adhering to the 6-step selection algorithm.
   */
  async selectEligibleAccount(
    tenantId: string,
    requiredCapability: string,
    excludeAccountIds: string[] = [],
  ): Promise<AccountSelectionResult> {
    // Check and restore any accounts whose cooldown has elapsed
    await this.healthService.processExpiredCooldowns();

    // Step 1: Find accounts in this tenant with capability relation and health relation
    const capabilityField = TASK_CAPABILITY_MAP[requiredCapability] || requiredCapability;

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        id: { notIn: excludeAccountIds },
        // Step 2 filter: Not restricted, disabled, reauth, unavailable
        status: AccountStatus.ACTIVE,
      },
      include: {
        capability: true,
        health: true,
      },
    });

    if (accounts.length === 0) {
      this.logger.warn(`No ACTIVE accounts found for tenant ${tenantId}`);
      return {
        selectedAccount: null,
        reason: 'No ACTIVE accounts available for tenant',
        evaluatedCandidatesCount: 0,
      };
    }

    // Filter Step 1: Required capability check
    const capableAccounts = accounts.filter((acc) => {
      if (!acc.capability) return true; // Default to capable if capability record not populated
      if (capabilityField in acc.capability) {
        return (acc.capability as any)[capabilityField] === true;
      }
      return true;
    });

    if (capableAccounts.length === 0) {
      this.logger.warn(`No accounts have required capability: ${requiredCapability}`);
      return {
        selectedAccount: null,
        reason: `No accounts have required capability '${requiredCapability}'`,
        evaluatedCandidatesCount: accounts.length,
      };
    }

    // Step 3: Remove accounts that have reached their configured concurrency limit
    const availableAccounts = capableAccounts.filter((acc) => {
      return acc.currentTaskCount < acc.maxConcurrency;
    });

    if (availableAccounts.length === 0) {
      this.logger.warn(`All capable accounts have reached concurrency limit`);
      return {
        selectedAccount: null,
        reason: 'All capable accounts have reached their maximum concurrency limits',
        evaluatedCandidatesCount: capableAccounts.length,
      };
    }

    // Steps 4, 5, 6: Score accounts based on Health & Current Workload
    // Formula:
    // score = (healthScore * 0.6) - (utilizationRatio * 30) - (consecutiveFailures * 10)
    // Utilization ratio = currentTaskCount / maxConcurrency (between 0.0 and 1.0)
    const scoredCandidates = availableAccounts.map((acc) => {
      const health: AccountHealth | null = acc.health;
      const healthScore = health?.healthScore ?? 100.0;
      const consecutiveFailures = health?.consecutiveFailures ?? 0;
      const utilization = acc.currentTaskCount / Math.max(1, acc.maxConcurrency);

      const score = healthScore * 0.6 - utilization * 30.0 - consecutiveFailures * 10.0;
      return {
        account: acc,
        score,
        reason: `Health=${healthScore.toFixed(1)}, Concurrency=${acc.currentTaskCount}/${acc.maxConcurrency}, ConsecFailures=${consecutiveFailures}`,
      };
    });

    // Sort descending by score; if tied, sort by oldest lastSuccessAt / creation date for fair round-robin
    scoredCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.account.health?.lastSuccessAt?.getTime() || 0;
      const bTime = b.account.health?.lastSuccessAt?.getTime() || 0;
      return aTime - bTime;
    });

    const best = scoredCandidates[0];
    const selectionReason = `Selected account ${best.account.id} (score: ${best.score.toFixed(2)}): ${best.reason}`;

    this.logger.log(selectionReason, {
      tenantId,
      selectedAccountId: best.account.id,
      evaluatedCount: availableAccounts.length,
    });

    return {
      selectedAccount: best.account,
      reason: selectionReason,
      evaluatedCandidatesCount: availableAccounts.length,
      candidateScores: scoredCandidates.map((c) => ({
        accountId: c.account.id,
        score: Number(c.score.toFixed(2)),
        reason: c.reason,
      })),
    };
  }
}
