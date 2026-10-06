import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';
import { Task, Account } from '@prisma/client';
import { TelegramTaskExecutor, TaskExecutionResult } from './interfaces/telegram-task-executor.interface';
import { ErrorCode } from '../common/constants/error-codes.constant';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class TelegramTaskExecutorService implements TelegramTaskExecutor {
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly simulationMode: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(TelegramTaskExecutorService.name);
    this.pythonPath = this.configService.get<string>('telegram.pythonPath', 'python');
    this.scriptPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('telegram.scriptPath', 'python/telegram_executor.py'),
    );
    this.simulationMode = this.configService.get<boolean>('telegram.simulationMode', true);
  }

  async execute(task: Task, account: Account): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    this.logger.log(`Executing task ${task.id} (${task.type}) using account ${account.id}`, {
      taskId: task.id,
      accountId: account.id,
      tenantId: task.tenantId,
      taskType: task.type,
    });

    const inputData = {
      type: task.type,
      payload: task.payload || {},
      account: {
        id: account.id,
        phone: account.phone,
        username: account.username,
        sessionString: account.sessionString,
        apiId: account.apiId,
        apiHash: account.apiHash,
      },
      simulation: this.simulationMode || !account.sessionString,
    };

    return new Promise<TaskExecutionResult>((resolve) => {
      const child = spawn(this.pythonPath, [this.scriptPath, '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Timeout after 60 seconds
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        const durationMs = Date.now() - startTime;
        this.logger.error(`Task execution timed out: ${task.id}`, undefined, {
          taskId: task.id,
          accountId: account.id,
          durationMs,
        });
        resolve({
          success: false,
          errorCode: ErrorCode.TIMEOUT,
          errorMessage: 'Telegram execution timed out after 60 seconds',
          durationMs,
        });
      }, 60000);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (timedOut) return;
        const durationMs = Date.now() - startTime;
        this.logger.error(`Failed to spawn Python executor: ${err.message}`, err.stack, {
          taskId: task.id,
          accountId: account.id,
          durationMs,
        });
        resolve({
          success: false,
          errorCode: ErrorCode.UNKNOWN_ERROR,
          errorMessage: `Python process spawn error: ${err.message}`,
          durationMs,
          rawError: err,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) return;

        const durationMs = Date.now() - startTime;
        try {
          if (!stdout.trim()) {
            resolve({
              success: false,
              errorCode: ErrorCode.UNKNOWN_ERROR,
              errorMessage: stderr.trim() || `Python executor exited with code ${code} without output`,
              durationMs,
            });
            return;
          }

          const parsed = JSON.parse(stdout.trim());
          const finalResult: TaskExecutionResult = {
            success: Boolean(parsed.success),
            data: parsed.data,
            errorCode: parsed.errorCode as ErrorCode || (parsed.success ? undefined : ErrorCode.UNKNOWN_ERROR),
            errorMessage: parsed.errorMessage,
            floodWaitSeconds: parsed.floodWaitSeconds,
            durationMs,
            rawError: stderr ? { stderr } : undefined,
          };

          this.logger.log(`Task execution finished with success=${finalResult.success}`, {
            taskId: task.id,
            accountId: account.id,
            success: finalResult.success,
            errorCode: finalResult.errorCode,
            durationMs,
          });

          resolve(finalResult);
        } catch (parseError) {
          this.logger.error(`Failed to parse executor output: ${stdout}`, parseError.stack, {
            taskId: task.id,
            accountId: account.id,
          });
          resolve({
            success: false,
            errorCode: ErrorCode.UNKNOWN_ERROR,
            errorMessage: `Invalid executor JSON response: ${stdout.slice(0, 200)}`,
            durationMs,
          });
        }
      });

      // Write payload to python stdin
      child.stdin.write(JSON.stringify(inputData));
      child.stdin.end();
    });
  }
}
