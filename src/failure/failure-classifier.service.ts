import { Injectable } from '@nestjs/common';
import { ErrorCode, ErrorSeverity } from '../common/constants/error-codes.constant';

export interface ClassifiedFailure {
  errorCode: ErrorCode;
  severity: ErrorSeverity;
  isRetryableTask: boolean;
  isAccountFailure: boolean;
  requiresAccountCooldown: boolean;
  suggestedCooldownSeconds?: number;
}

@Injectable()
export class FailureClassifierService {
  classify(errorCode?: string | null, floodWaitSeconds?: number): ClassifiedFailure {
    const code = (errorCode as ErrorCode) || ErrorCode.UNKNOWN_ERROR;

    switch (code) {
      // Account Fatal
      case ErrorCode.ACCOUNT_RESTRICTED:
      case ErrorCode.ACCOUNT_SESSION_INVALID:
      case ErrorCode.ACCOUNT_AUTH_REQUIRED:
        return {
          errorCode: code,
          severity: ErrorSeverity.FATAL_ACCOUNT,
          isRetryableTask: true, // Task can be retried with another account
          isAccountFailure: true,
          requiresAccountCooldown: false,
        };

      // Account Temporary / Cooldown
      case ErrorCode.FLOOD_WAIT:
        return {
          errorCode: code,
          severity: ErrorSeverity.TEMPORARY_ACCOUNT,
          isRetryableTask: true,
          isAccountFailure: true,
          requiresAccountCooldown: true,
          suggestedCooldownSeconds: floodWaitSeconds || 60,
        };

      case ErrorCode.RATE_LIMITED:
      case ErrorCode.ACCOUNT_BUSY:
        return {
          errorCode: code,
          severity: ErrorSeverity.TEMPORARY_ACCOUNT,
          isRetryableTask: true,
          isAccountFailure: true,
          requiresAccountCooldown: true,
          suggestedCooldownSeconds: 300,
        };

      // Task Fatal / Non-retryable
      case ErrorCode.TARGET_NOT_FOUND:
      case ErrorCode.TARGET_PRIVATE:
      case ErrorCode.PERMISSION_DENIED:
      case ErrorCode.OPERATION_NOT_ALLOWED:
      case ErrorCode.TASK_INVALID:
      case ErrorCode.TASK_EXPIRED:
      case ErrorCode.TASK_CANCELLED:
        return {
          errorCode: code,
          severity: ErrorSeverity.FATAL_TASK,
          isRetryableTask: false,
          isAccountFailure: false,
          requiresAccountCooldown: false,
        };

      // Temporary Network / Timeout / Server Retryable
      case ErrorCode.TEMPORARY_ERROR:
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.TIMEOUT:
        return {
          errorCode: code,
          severity: ErrorSeverity.RETRYABLE_TASK,
          isRetryableTask: true,
          isAccountFailure: false,
          requiresAccountCooldown: false,
        };

      // Fallback
      case ErrorCode.UNKNOWN_ERROR:
      default:
        return {
          errorCode: ErrorCode.UNKNOWN_ERROR,
          severity: ErrorSeverity.RETRYABLE_TASK,
          isRetryableTask: true,
          isAccountFailure: false,
          requiresAccountCooldown: false,
        };
    }
  }
}
