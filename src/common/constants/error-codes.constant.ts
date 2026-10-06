export enum ErrorCode {
  // Account level problems
  ACCOUNT_RESTRICTED = 'ACCOUNT_RESTRICTED',
  ACCOUNT_SESSION_INVALID = 'ACCOUNT_SESSION_INVALID',
  ACCOUNT_AUTH_REQUIRED = 'ACCOUNT_AUTH_REQUIRED',
  ACCOUNT_BUSY = 'ACCOUNT_BUSY',
  ACCOUNT_NO_ELIGIBLE = 'ACCOUNT_NO_ELIGIBLE',

  // Temporary / retryable errors
  TEMPORARY_ERROR = 'TEMPORARY_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  FLOOD_WAIT = 'FLOOD_WAIT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Target / permission errors (non-retryable for task)
  TARGET_NOT_FOUND = 'TARGET_NOT_FOUND',
  TARGET_PRIVATE = 'TARGET_PRIVATE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',

  // Task level issues
  TASK_INVALID = 'TASK_INVALID',
  TASK_EXPIRED = 'TASK_EXPIRED',
  TASK_CANCELLED = 'TASK_CANCELLED',
  LEASE_EXPIRED = 'LEASE_EXPIRED',
  STALE_WORKER = 'STALE_WORKER',

  // Fallback
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorSeverity {
  FATAL_ACCOUNT = 'FATAL_ACCOUNT',       // Account must be restricted or auth required
  TEMPORARY_ACCOUNT = 'TEMPORARY_ACCOUNT', // Account needs cooldown (flood wait, rate limit)
  FATAL_TASK = 'FATAL_TASK',             // Task is invalid or forbidden, fail immediately
  RETRYABLE_TASK = 'RETRYABLE_TASK',     // Network/timeout/temporary, retry same or different account
}
