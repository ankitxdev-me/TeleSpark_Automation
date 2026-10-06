import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { Job, JobStatus, Prisma, AccountStatus, TaskPriority } from '@prisma/client';
import { CreateJobDto } from './dtos/create-job.dto';
import { CreateReactionJobDto } from './dtos/create-reaction-job.dto';
import { CreateCommentJobDto, DEFAULT_COMMENT_MESSAGES, CommentMode } from './dtos/create-comment-job.dto';
import {
  CreateJoinJobDto,
  CreateLeaveJobDto,
  CreateDmJobDto,
  CreateGroupMessageJobDto,
} from './dtos/campaign-jobs.dto';
import { TaskType } from '../common/constants/task-types.constant';
import { TaskService } from '../task/task.service';
import { QueryTasksDto } from '../task/dtos/query-tasks.dto';

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TaskService))
    private readonly taskService: TaskService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(JobService.name);
  }

  async create(tenantId: string, dto: CreateJobDto): Promise<Job> {
    const totalTasks = dto.tasks.length;

    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: dto.type,
        status: JobStatus.QUEUED,
        totalTasks,
        pendingTasks: totalTasks,
        completedTasks: 0,
        failedTasks: 0,
        metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    this.logger.log(`Created bulk job ${job.id} with ${totalTasks} tasks`, {
      tenantId,
      jobId: job.id,
      totalTasks,
    });

    // Create and enqueue individual tasks asynchronously
    for (const taskDto of dto.tasks) {
      await this.taskService.create(tenantId, taskDto, job.id);
    }

    return job;
  }

  /**
   * Calculates progressive execution delays for each sequential task in a campaign.
   * Supports:
   * 1. Fixed interval delay (e.g. 5s between each task)
   * 2. Variable / Random delay range (e.g. random between 10s and 50s for each task: Task 1 +10s, Task 2 +50s, Task 3 +20s, Task 4 +15s...)
   * 3. Explicit custom delay sequence (e.g. [10, 50, 20, 15])
   */
  private computeProgressiveTaskDelays(
    count: number,
    options: {
      intervalSeconds?: number;
      delaySeconds?: number;
      minDelaySeconds?: number;
      maxDelaySeconds?: number;
      customDelays?: number[];
      delayMode?: string;
    },
    defaultInterval = 3,
  ): { delayMs: number; taskDelaySeconds: number }[] {
    const result: { delayMs: number; taskDelaySeconds: number }[] = [];
    const minD = options.minDelaySeconds !== undefined && options.minDelaySeconds !== null ? Number(options.minDelaySeconds) : undefined;
    const maxD = options.maxDelaySeconds !== undefined && options.maxDelaySeconds !== null ? Number(options.maxDelaySeconds) : undefined;
    const isRandomRange = minD !== undefined && maxD !== undefined && !isNaN(minD) && !isNaN(maxD) && maxD >= minD;
    const custom = Array.isArray(options.customDelays) && options.customDelays.length > 0 ? options.customDelays.map(Number).filter(n => !isNaN(n)) : null;
    const baseInterval = Number(options.intervalSeconds ?? options.delaySeconds ?? defaultInterval);

    let accumulatedMs = 0;

    for (let i = 0; i < count; i++) {
      let taskDelaySec = 0;
      if (custom && custom.length > 0) {
        taskDelaySec = custom[i % custom.length];
      } else if (isRandomRange) {
        // Random integer between minD and maxD inclusive
        taskDelaySec = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
      } else {
        // Fixed interval
        taskDelaySec = (i === 0) ? 0 : baseInterval;
      }

      if (i === 0 && !custom && !isRandomRange) {
        accumulatedMs = 0;
      } else {
        accumulatedMs += taskDelaySec * 1000;
      }

      result.push({
        delayMs: accumulatedMs,
        taskDelaySeconds: taskDelaySec,
      });
    }

    return result;
  }

  /**
   * Dispatches a multi-reaction campaign on a Telegram post.
   * Ensures 1 reaction per unique account, rotating emojis in round-robin order.
   */
  async createReactionJob(tenantId: string, dto: CreateReactionJobDto, createdBy?: string) {
    const reactions =
      (dto.reactions && dto.reactions.length > 0 ? dto.reactions : dto.emojis) || [];
    if (reactions.length === 0) {
      throw new BadRequestException('At least one reaction emoji must be specified');
    }

    // 1. Resolve Target Chat & Message ID
    let targetChat = dto.chatId;
    let targetMsgId = dto.messageId;
    const postUrl = dto.postUrl || dto.target;

    if (postUrl) {
      const cleaned = postUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      const parts = cleaned.split('/');
      if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
        targetMsgId = parseInt(parts[parts.length - 1], 10);
        targetChat = parts[parts.length - 2];
      } else if (parts.length >= 2) {
        targetChat = parts[parts.length - 1];
      }
    }

    if (!targetChat || !targetMsgId) {
      throw new BadRequestException(
        'A valid Telegram post URL (e.g. https://t.me/ForPayoutRecords/728) or chatId + messageId is required',
      );
    }

    // 2. Fetch all ACTIVE accounts with canReaction capability in this tenant
    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        status: AccountStatus.ACTIVE,
      },
      include: {
        capability: true,
        health: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const eligibleAccounts = accounts.filter((acc) => {
      if (!acc.capability) return true;
      return acc.capability.canReaction === true;
    });

    if (eligibleAccounts.length === 0) {
      throw new BadRequestException(
        'No active Telegram accounts with canReaction capability are available in this tenant',
      );
    }

    // 3. Determine how many reactions to dispatch
    const requestedCount = dto.count ?? dto.reactionCount ?? eligibleAccounts.length;
    const allowPartial = dto.allowPartial !== false; // default true

    if (requestedCount > eligibleAccounts.length && !allowPartial) {
      throw new BadRequestException(
        `Requested ${requestedCount} reactions, but only ${eligibleAccounts.length} active capable accounts are available. Set allowPartial: true or add more accounts.`,
      );
    }

    const effectiveCount = Math.min(requestedCount, eligibleAccounts.length);
    const selectedAccounts = eligibleAccounts.slice(0, effectiveCount);

    const intervalSeconds = dto.intervalSeconds ?? dto.delaySeconds ?? 2;
    const now = Date.now();

    // 4. Create Job Record
    const taskDelays = this.computeProgressiveTaskDelays(selectedAccounts.length, dto, 2);

    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: 'REACTION_CAMPAIGN',
        status: JobStatus.QUEUED,
        totalTasks: effectiveCount,
        pendingTasks: effectiveCount,
        completedTasks: 0,
        failedTasks: 0,
        metadata: {
          createdBy: createdBy || 'Operator',
          targetChat,
          targetMsgId,
          postUrl,
          reactions: dto.reactions,
          requestedCount,
          dispatchedCount: effectiveCount,
          availableAccounts: eligibleAccounts.length,
          delayMode: dto.delayMode || (dto.minDelaySeconds && dto.maxDelaySeconds ? 'random' : 'fixed'),
          minDelaySeconds: dto.minDelaySeconds,
          maxDelaySeconds: dto.maxDelaySeconds,
          customDelays: dto.customDelays,
          delays: taskDelays.map((t) => t.taskDelaySeconds),
          intervalSeconds,
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    // 5. Create and enqueue tasks with round-robin rotation of emojis and unique assigned accounts
    const taskDetails = [];
    for (let i = 0; i < selectedAccounts.length; i++) {
      const account = selectedAccounts[i];
      const emoji = reactions[i % reactions.length];
      const { delayMs, taskDelaySeconds } = taskDelays[i];
      const scheduledAt = new Date(now + delayMs);

      const task = await this.taskService.create(
        tenantId,
        {
          type: TaskType.REACTION,
          priority: TaskPriority.HIGH,
          assignedAccountId: account.id,
          scheduledAt: scheduledAt.toISOString(),
          payload: {
            chatId: targetChat,
            messageId: targetMsgId,
            reaction: emoji,
            delaySeconds: taskDelaySeconds,
          },
        },
        job.id,
      );

      taskDetails.push({
        taskId: task.id,
        accountId: account.id,
        phone: account.phone,
        username: account.username,
        reaction: emoji,
        delaySeconds: taskDelaySeconds,
        scheduledAt: scheduledAt.toISOString(),
      });
    }

    this.logger.log(
      `Dispatched reaction campaign job ${job.id} on ${targetChat}/${targetMsgId}: ${effectiveCount} reactions rotated across ${selectedAccounts.length} accounts`,
      {
        tenantId,
        jobId: job.id,
        targetChat,
        targetMsgId,
        effectiveCount,
        requestedCount,
      },
    );

    return {
      jobId: job.id,
      targetChat,
      targetMsgId,
      status: job.status,
      requestedCount,
      dispatchedCount: effectiveCount,
      availableAccounts: eligibleAccounts.length,
      reactions: reactions,
      rotation: taskDetails,
    };
  }

  /**
   * Dispatches a multi-account / multi-message comment campaign on a Telegram post.
   * Handles:
   * - Single account commenting multiple times
   * - Multiple accounts rotating (e.g. Account 1 -> Account 2 -> Account 1 -> Account 2)
   * - Limits active accounts used to maxAccounts (default: 2)
   * - Custom messages or predefined random message pool ("hello", "hi", "done", "task done", etc.)
   */
  async createCommentJob(tenantId: string, dto: CreateCommentJobDto, createdBy?: string) {
    const totalCount = dto.count ?? dto.commentCount ?? 1;
    if (totalCount <= 0) {
      throw new BadRequestException('Count must be greater than 0');
    }

    // 1. Resolve Target Chat & Message ID
    let targetChat = dto.chatId;
    let targetMsgId = dto.messageId;
    const postUrl = dto.postUrl || dto.target;

    if (postUrl) {
      const cleaned = postUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      const parts = cleaned.split('/');
      if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
        targetMsgId = parseInt(parts[parts.length - 1], 10);
        targetChat = parts[parts.length - 2];
      } else if (parts.length >= 2) {
        targetChat = parts[parts.length - 1];
      }
    }

    if (!targetChat || !targetMsgId) {
      throw new BadRequestException(
        'A valid Telegram post URL (e.g. https://t.me/ForPayoutRecords/728) or chatId + messageId is required',
      );
    }

    // 2. Resolve Message Pool (Custom or Predefined)
    const rawMessages =
      (dto.messages && dto.messages.length > 0 ? dto.messages : dto.comments) || [];
    const messagePool =
      rawMessages.length > 0 ? rawMessages : DEFAULT_COMMENT_MESSAGES;

    const useRandom = dto.useRandomMessages !== false; // default true

    // 3. Resolve Mode & Eligible Accounts
    const isSingleAccountMode = dto.mode === CommentMode.SINGLE_ACCOUNT;
    let selectedAccounts = [];

    if (dto.accountIds && dto.accountIds.length > 0) {
      const accounts = await this.prisma.account.findMany({
        where: {
          id: { in: dto.accountIds },
          tenantId,
          status: AccountStatus.ACTIVE,
        },
        include: { capability: true, health: true },
      });

      const eligible = accounts.filter(
        (a) => !a.capability || a.capability.canComment === true,
      );

      if (eligible.length === 0) {
        throw new BadRequestException(
          'None of the specified accounts are ACTIVE with canComment capability in this tenant',
        );
      }

      selectedAccounts = isSingleAccountMode ? [eligible[0]] : eligible;
    } else {
      // Auto-select active accounts with canComment capability
      // SINGLE_ACCOUNT mode -> limit to 1 account
      // MULTIPLE_ACCOUNTS mode -> limit to maxAccounts (default 2)
      const maxAccounts = isSingleAccountMode ? 1 : (dto.maxAccounts ?? 2);
      const accounts = await this.prisma.account.findMany({
        where: {
          tenantId,
          status: AccountStatus.ACTIVE,
        },
        include: { capability: true, health: true },
        orderBy: { createdAt: 'asc' },
      });

      const eligibleAccounts = accounts.filter(
        (a) => !a.capability || a.capability.canComment === true,
      );

      if (eligibleAccounts.length === 0) {
        throw new BadRequestException(
          'No active Telegram accounts with canComment capability are available in this tenant',
        );
      }

      selectedAccounts = eligibleAccounts.slice(0, maxAccounts);
    }

    const intervalSeconds = dto.intervalSeconds ?? dto.delaySeconds ?? 3;
    const now = Date.now();

    const taskDelays = this.computeProgressiveTaskDelays(totalCount, dto, 3);

    // 4. Create Job Record
    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: 'COMMENT_CAMPAIGN',
        status: JobStatus.QUEUED,
        totalTasks: totalCount,
        pendingTasks: totalCount,
        completedTasks: 0,
        failedTasks: 0,
        metadata: {
          createdBy: createdBy || 'Operator',
          targetChat,
          targetMsgId,
          postUrl,
          totalCount,
          accountCount: selectedAccounts.length,
          accountIds: selectedAccounts.map((a) => a.id),
          delayMode: dto.delayMode || (dto.minDelaySeconds && dto.maxDelaySeconds ? 'random' : 'fixed'),
          minDelaySeconds: dto.minDelaySeconds,
          maxDelaySeconds: dto.maxDelaySeconds,
          customDelays: dto.customDelays,
          delays: taskDelays.map((t) => t.taskDelaySeconds),
          intervalSeconds,
          useRandomMessages: useRandom,
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    // 5. Create & Enqueue Tasks rotating across the selected accounts
    // e.g. If 2 accounts and 5 comments:
    // Task 0 -> Account 0, Task 1 -> Account 1, Task 2 -> Account 0, Task 3 -> Account 1, Task 4 -> Account 0
    const taskDetails = [];
    for (let i = 0; i < totalCount; i++) {
      const account = selectedAccounts[i % selectedAccounts.length];
      const message = useRandom
        ? messagePool[Math.floor(Math.random() * messagePool.length)]
        : messagePool[i % messagePool.length];

      const { delayMs, taskDelaySeconds } = taskDelays[i];
      const scheduledAt = new Date(now + delayMs);

      const task = await this.taskService.create(
        tenantId,
        {
          type: TaskType.COMMENT,
          priority: TaskPriority.HIGH,
          assignedAccountId: account.id,
          scheduledAt: scheduledAt.toISOString(),
          payload: {
            chatId: targetChat,
            messageId: targetMsgId,
            text: message,
            delaySeconds: taskDelaySeconds,
          },
        },
        job.id,
      );

      taskDetails.push({
        taskId: task.id,
        accountId: account.id,
        phone: account.phone,
        username: account.username,
        text: message,
        delaySeconds: taskDelaySeconds,
        scheduledAt: scheduledAt.toISOString(),
      });
    }

    this.logger.log(
      `Dispatched comment campaign job ${job.id} on ${targetChat}/${targetMsgId}: ${totalCount} comments rotated across ${selectedAccounts.length} accounts`,
      {
        tenantId,
        jobId: job.id,
        targetChat,
        targetMsgId,
        totalCount,
        accountsUsed: selectedAccounts.length,
      },
    );

    return {
      jobId: job.id,
      targetChat,
      targetMsgId,
      status: job.status,
      mode: isSingleAccountMode ? CommentMode.SINGLE_ACCOUNT : CommentMode.MULTIPLE_ACCOUNTS,
      totalComments: totalCount,
      accountsUsedCount: selectedAccounts.length,
      accounts: selectedAccounts.map((a) => ({
        id: a.id,
        phone: a.phone,
        username: a.username,
      })),
      comments: taskDetails,
    };
  }

  /**
   * Community Join Campaign: Joins a group/channel with N active accounts.
   */
  async createJoinJob(tenantId: string, dto: CreateJoinJobDto, createdBy?: string) {
    const target = (dto.target || dto.link || '').trim();
    if (!target) {
      throw new BadRequestException('Target group/channel link or username is required');
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        status: AccountStatus.ACTIVE,
        ...(dto.accountIds && dto.accountIds.length > 0 ? { id: { in: dto.accountIds } } : {}),
      },
      include: { capability: true },
      orderBy: { createdAt: 'asc' },
    });

    const eligible = accounts.filter((a) => !a.capability || a.capability.canJoinChat === true);
    if (eligible.length === 0) {
      throw new BadRequestException('No active accounts with canJoinChat capability available');
    }

    const count = Math.min(dto.count ?? dto.accountLimit ?? 1, eligible.length);
    const selectedAccounts = eligible.slice(0, count);
    const intervalSeconds = dto.intervalSeconds ?? dto.delaySeconds ?? 3;
    const now = Date.now();

    const taskDelays = this.computeProgressiveTaskDelays(selectedAccounts.length, dto, 3);

    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: 'JOIN_CAMPAIGN',
        status: JobStatus.QUEUED,
        totalTasks: count,
        pendingTasks: count,
        completedTasks: 0,
        failedTasks: 0,
        metadata: {
          createdBy: createdBy || 'Operator',
          target,
          accountsCount: count,
          delayMode: dto.delayMode || (dto.minDelaySeconds && dto.maxDelaySeconds ? 'random' : 'fixed'),
          minDelaySeconds: dto.minDelaySeconds,
          maxDelaySeconds: dto.maxDelaySeconds,
          customDelays: dto.customDelays,
          delays: taskDelays.map((t) => t.taskDelaySeconds),
          intervalSeconds,
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    const taskDetails = [];
    for (let i = 0; i < selectedAccounts.length; i++) {
      const account = selectedAccounts[i];
      const { delayMs, taskDelaySeconds } = taskDelays[i];
      const scheduledAt = new Date(now + delayMs);

      const task = await this.taskService.create(
        tenantId,
        {
          type: TaskType.JOIN_CHAT,
          priority: TaskPriority.HIGH,
          assignedAccountId: account.id,
          scheduledAt: scheduledAt.toISOString(),
          payload: { target, delaySeconds: taskDelaySeconds },
        },
        job.id,
      );

      taskDetails.push({
        taskId: task.id,
        accountId: account.id,
        phone: account.phone,
        delaySeconds: taskDelaySeconds,
        scheduledAt: scheduledAt.toISOString(),
      });
    }

    return {
      jobId: job.id,
      target,
      status: job.status,
      dispatchedCount: count,
      accounts: taskDetails,
    };
  }

  /**
   * Community Leave Campaign: Leaves a group/channel with N active accounts.
   */
  async createLeaveJob(tenantId: string, dto: CreateLeaveJobDto, createdBy?: string) {
    const target = (dto.target || dto.link || '').trim();
    if (!target) {
      throw new BadRequestException('Target group/channel link or username is required');
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        status: AccountStatus.ACTIVE,
        ...(dto.accountIds && dto.accountIds.length > 0 ? { id: { in: dto.accountIds } } : {}),
      },
      include: { capability: true },
      orderBy: { createdAt: 'asc' },
    });

    const eligible = accounts.filter((a) => !a.capability || a.capability.canLeaveChat === true);
    if (eligible.length === 0) {
      throw new BadRequestException('No active accounts with canLeaveChat capability available');
    }

    const count = Math.min(dto.count ?? dto.accountLimit ?? 1, eligible.length);
    const selectedAccounts = eligible.slice(0, count);
    const intervalSeconds = dto.intervalSeconds ?? dto.delaySeconds ?? 2;
    const now = Date.now();

    const taskDelays = this.computeProgressiveTaskDelays(selectedAccounts.length, dto, 2);

    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: 'LEAVE_CAMPAIGN',
        status: JobStatus.QUEUED,
        totalTasks: count,
        pendingTasks: count,
        completedTasks: 0,
        failedTasks: 0,
        metadata: {
          createdBy: createdBy || 'Operator',
          target,
          accountsCount: count,
          delayMode: dto.delayMode || (dto.minDelaySeconds && dto.maxDelaySeconds ? 'random' : 'fixed'),
          minDelaySeconds: dto.minDelaySeconds,
          maxDelaySeconds: dto.maxDelaySeconds,
          customDelays: dto.customDelays,
          delays: taskDelays.map((t) => t.taskDelaySeconds),
          intervalSeconds,
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    const taskDetails = [];
    for (let i = 0; i < selectedAccounts.length; i++) {
      const account = selectedAccounts[i];
      const { delayMs, taskDelaySeconds } = taskDelays[i];
      const scheduledAt = new Date(now + delayMs);

      const task = await this.taskService.create(
        tenantId,
        {
          type: TaskType.LEAVE_CHAT,
          priority: TaskPriority.HIGH,
          assignedAccountId: account.id,
          scheduledAt: scheduledAt.toISOString(),
          payload: { target, delaySeconds: taskDelaySeconds },
        },
        job.id,
      );

      taskDetails.push({
        taskId: task.id,
        accountId: account.id,
        phone: account.phone,
        delaySeconds: taskDelaySeconds,
        scheduledAt: scheduledAt.toISOString(),
      });
    }

    return {
      jobId: job.id,
      target,
      status: job.status,
      dispatchedCount: count,
      accounts: taskDetails,
    };
  }

  /**
   * Direct Messaging Campaign:
   * - Supports Single User (multiple messages or multiple accounts)
   * - Supports Multiple Users ("Message every user" rotating senders)
   */
  async createDmJob(tenantId: string, dto: CreateDmJobDto, createdBy?: string) {
    const rawRecipients =
      dto.recipients && dto.recipients.length > 0
        ? dto.recipients
        : dto.users && dto.users.length > 0
          ? dto.users
          : dto.targets && dto.targets.length > 0
            ? dto.targets
            : dto.recipient
              ? [dto.recipient]
              : dto.user
                ? [dto.user]
                : dto.target
                  ? [dto.target]
                  : [];
    const recipients = rawRecipients.map((r) => r.trim()).filter(Boolean);

    if (recipients.length === 0) {
      throw new BadRequestException('At least one recipient username or link is required');
    }

    const messages = (
      dto.messages && dto.messages.length > 0
        ? dto.messages
        : dto.message
          ? [dto.message]
          : []
    ).map((m) => m.trim()).filter(Boolean);

    if (messages.length === 0) {
      throw new BadRequestException('At least one message is required');
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        status: AccountStatus.ACTIVE,
        ...(dto.accountIds && dto.accountIds.length > 0 ? { id: { in: dto.accountIds } } : {}),
      },
      include: { capability: true },
      orderBy: { createdAt: 'asc' },
    });

    const eligible = accounts.filter((a) => !a.capability || a.capability.canSendMessage === true);
    if (eligible.length === 0) {
      throw new BadRequestException('No active accounts with canSendMessage capability available');
    }

    const intervalSeconds = dto.intervalSeconds ?? dto.delaySeconds ?? 3;
    const now = Date.now();

    // Determine task pairs:
    // If single recipient with multiple messages: send each message to that recipient
    // If multiple recipients: rotate messages and accounts across the recipients
    const dispatchList: { recipient: string; message: string; account: any }[] = [];

    if (recipients.length === 1 && messages.length > 1) {
      // 1 recipient, N messages line-by-line
      for (let i = 0; i < messages.length; i++) {
        dispatchList.push({
          recipient: recipients[0],
          message: messages[i],
          account: eligible[i % eligible.length],
        });
      }
    } else {
      // Multiple recipients ("Message every user")
      for (let i = 0; i < recipients.length; i++) {
        dispatchList.push({
          recipient: recipients[i],
          message: messages[i % messages.length],
          account: eligible[i % eligible.length],
        });
      }
    }

    const taskDelays = this.computeProgressiveTaskDelays(dispatchList.length, dto, 3);

    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: 'DM_CAMPAIGN',
        status: JobStatus.QUEUED,
        totalTasks: dispatchList.length,
        pendingTasks: dispatchList.length,
        completedTasks: 0,
        failedTasks: 0,
        metadata: {
          createdBy: createdBy || 'Operator',
          recipientsCount: recipients.length,
          messagesCount: messages.length,
          accountsUsed: eligible.length,
          delayMode: dto.delayMode || (dto.minDelaySeconds && dto.maxDelaySeconds ? 'random' : 'fixed'),
          minDelaySeconds: dto.minDelaySeconds,
          maxDelaySeconds: dto.maxDelaySeconds,
          customDelays: dto.customDelays,
          delays: taskDelays.map((t) => t.taskDelaySeconds),
          intervalSeconds,
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    const taskDetails = [];
    for (let i = 0; i < dispatchList.length; i++) {
      const item = dispatchList[i];
      const { delayMs, taskDelaySeconds } = taskDelays[i];
      const scheduledAt = new Date(now + delayMs);

      const task = await this.taskService.create(
        tenantId,
        {
          type: TaskType.SEND_MESSAGE,
          priority: TaskPriority.HIGH,
          assignedAccountId: item.account.id,
          scheduledAt: scheduledAt.toISOString(),
          payload: {
            recipient: item.recipient,
            text: item.message,
            delaySeconds: taskDelaySeconds,
          },
        },
        job.id,
      );

      taskDetails.push({
        taskId: task.id,
        recipient: item.recipient,
        text: item.message,
        accountId: item.account.id,
        phone: item.account.phone,
        delaySeconds: taskDelaySeconds,
        scheduledAt: scheduledAt.toISOString(),
      });
    }

    return {
      jobId: job.id,
      status: job.status,
      totalTasks: dispatchList.length,
      recipientsCount: recipients.length,
      accountsUsedCount: eligible.length,
      dispatches: taskDetails,
    };
  }

  /**
   * Group Messaging Campaign:
   * - Supports Single Group (multiple messages line-by-line)
   * - Supports Multiple Groups (broadcast single message across groups)
   */
  async createGroupMessageJob(tenantId: string, dto: CreateGroupMessageJobDto, createdBy?: string) {
    const rawGroups =
      dto.groups && dto.groups.length > 0
        ? dto.groups
        : dto.targetChats && dto.targetChats.length > 0
          ? dto.targetChats
          : dto.chats && dto.chats.length > 0
            ? dto.chats
            : dto.targets && dto.targets.length > 0
              ? dto.targets
              : dto.target
                ? [dto.target]
                : [];
    const groups = rawGroups.map((g) => g.trim()).filter(Boolean);

    if (groups.length === 0) {
      throw new BadRequestException('At least one group username or link is required');
    }

    const messages = (
      dto.messages && dto.messages.length > 0
        ? dto.messages
        : dto.message
          ? [dto.message]
          : []
    ).map((m) => m.trim()).filter(Boolean);

    if (messages.length === 0) {
      throw new BadRequestException('At least one message is required');
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        status: AccountStatus.ACTIVE,
        ...(dto.accountIds && dto.accountIds.length > 0 ? { id: { in: dto.accountIds } } : {}),
      },
      include: { capability: true },
      orderBy: { createdAt: 'asc' },
    });

    const eligible = accounts.filter((a) => !a.capability || a.capability.canSendMessage === true);
    if (eligible.length === 0) {
      throw new BadRequestException('No active accounts with canSendMessage capability available');
    }

    const intervalSeconds = dto.intervalSeconds ?? dto.delaySeconds ?? 3;
    const now = Date.now();

    const dispatchList: { group: string; message: string; account: any }[] = [];

    if (groups.length === 1 && messages.length > 1) {
      // 1 group, multiple messages line-by-line
      for (let i = 0; i < messages.length; i++) {
        dispatchList.push({
          group: groups[0],
          message: messages[i],
          account: eligible[i % eligible.length],
        });
      }
    } else {
      // Broadcast to multiple groups
      for (let i = 0; i < groups.length; i++) {
        dispatchList.push({
          group: groups[i],
          message: messages[i % messages.length],
          account: eligible[i % eligible.length],
        });
      }
    }

    const taskDelays = this.computeProgressiveTaskDelays(dispatchList.length, dto, 3);

    const job = await this.prisma.job.create({
      data: {
        tenantId,
        type: 'GROUP_MSG_CAMPAIGN',
        status: JobStatus.QUEUED,
        totalTasks: dispatchList.length,
        pendingTasks: dispatchList.length,
        completedTasks: 0,
        failedTasks: 0,
        metadata: {
          createdBy: createdBy || 'Operator',
          groupsCount: groups.length,
          messagesCount: messages.length,
          accountsUsed: eligible.length,
          delayMode: dto.delayMode || (dto.minDelaySeconds && dto.maxDelaySeconds ? 'random' : 'fixed'),
          minDelaySeconds: dto.minDelaySeconds,
          maxDelaySeconds: dto.maxDelaySeconds,
          customDelays: dto.customDelays,
          delays: taskDelays.map((t) => t.taskDelaySeconds),
          intervalSeconds,
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    const taskDetails = [];
    for (let i = 0; i < dispatchList.length; i++) {
      const item = dispatchList[i];
      const { delayMs, taskDelaySeconds } = taskDelays[i];
      const scheduledAt = new Date(now + delayMs);

      const task = await this.taskService.create(
        tenantId,
        {
          type: TaskType.SEND_MESSAGE,
          priority: TaskPriority.HIGH,
          assignedAccountId: item.account.id,
          scheduledAt: scheduledAt.toISOString(),
          payload: {
            recipient: item.group,
            text: item.message,
            delaySeconds: taskDelaySeconds,
          },
        },
        job.id,
      );

      taskDetails.push({
        taskId: task.id,
        group: item.group,
        text: item.message,
        accountId: item.account.id,
        phone: item.account.phone,
        delaySeconds: taskDelaySeconds,
        scheduledAt: scheduledAt.toISOString(),
      });
    }

    return {
      jobId: job.id,
      status: job.status,
      totalTasks: dispatchList.length,
      groupsCount: groups.length,
      accountsUsedCount: eligible.length,
      dispatches: taskDetails,
    };
  }

  async findAll(tenantId: string, limit = 30): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findOne(tenantId: string, id: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({
      where: { id, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return job;
  }

  async findJobTasks(tenantId: string, jobId: string, query: QueryTasksDto) {
    await this.findOne(tenantId, jobId);
    return this.taskService.findAll(tenantId, { ...query, jobId });
  }

  async cancel(tenantId: string, id: string): Promise<Job> {
    const job = await this.findOne(tenantId, id);

    const terminalStatuses: JobStatus[] = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];
    if (terminalStatuses.includes(job.status)) {
      throw new BadRequestException(`Job ${id} is already in terminal state '${job.status}'`);
    }

    // Cancel all non-terminal tasks for this job
    const tasks = await this.prisma.task.findMany({
      where: { jobId: id, tenantId },
      select: { id: true, status: true },
    });

    for (const task of tasks) {
      try {
        await this.taskService.cancel(tenantId, task.id, 'Parent job cancelled');
      } catch (e) {
        // Continue cancelling remaining tasks
      }
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.CANCELLED,
        completedAt: new Date(),
      },
    });

    this.logger.log(`Job ${id} cancelled`, { jobId: id, tenantId });
    return updated;
  }

  async incrementJobProgress(jobId: string, isSuccess: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job || job.status === JobStatus.CANCELLED) return;

      const completed = job.completedTasks + (isSuccess ? 1 : 0);
      const failed = job.failedTasks + (isSuccess ? 0 : 1);
      const pending = Math.max(0, job.pendingTasks - 1);

      let status = job.status;
      let completedAt: Date | null = null;

      if (pending === 0 || completed + failed >= job.totalTasks) {
        completedAt = new Date();
        if (failed === 0) {
          status = JobStatus.COMPLETED;
        } else if (completed === 0) {
          status = JobStatus.FAILED;
        } else {
          status = JobStatus.PARTIALLY_COMPLETED;
        }
      } else {
        status = JobStatus.RUNNING;
      }

      await tx.job.update({
        where: { id: jobId },
        data: {
          completedTasks: completed,
          failedTasks: failed,
          pendingTasks: pending,
          status,
          completedAt,
        },
      });

      this.logger.debug(`Job ${jobId} progress: ${completed + failed}/${job.totalTasks} (status: ${status})`);
    });
  }
}
