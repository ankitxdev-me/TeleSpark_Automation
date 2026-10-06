import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RetryService {
  private readonly defaultBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly defaultJitterMs: number;
  private readonly defaultMaxAttempts: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultBaseDelayMs = this.configService.get<number>('task.defaultRetryBaseDelayMs', 2000);
    this.maxRetryDelayMs = this.configService.get<number>('task.maxRetryDelayMs', 60000);
    this.defaultJitterMs = this.configService.get<number>('task.retryJitterMs', 1000);
    this.defaultMaxAttempts = this.configService.get<number>('task.maxAttempts', 5);
  }

  isRetryable(currentAttemptCount: number, maxAttempts: number = this.defaultMaxAttempts): boolean {
    return currentAttemptCount < maxAttempts;
  }

  calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number = this.defaultBaseDelayMs,
    maxDelayMs: number = this.maxRetryDelayMs,
    jitterMs: number = this.defaultJitterMs,
  ): number {
    // Exponential backoff: baseDelay * 2^(attempt - 1)
    const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const capped = Math.min(exponential, maxDelayMs);
    // Add non-negative jitter [0, jitterMs]
    const jitter = Math.floor(Math.random() * jitterMs);
    return capped + jitter;
  }
}
