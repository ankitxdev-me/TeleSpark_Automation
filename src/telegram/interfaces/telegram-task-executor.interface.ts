import { Task, Account } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-codes.constant';

export interface TaskExecutionResult {
  success: boolean;
  data?: any;
  errorCode?: ErrorCode;
  errorMessage?: string;
  floodWaitSeconds?: number;
  durationMs?: number;
  rawError?: any;
}

export interface TelegramTaskExecutor {
  execute(task: Task, account: Account): Promise<TaskExecutionResult>;
}
