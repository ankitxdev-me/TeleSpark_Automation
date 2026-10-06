export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  masterApiKey: process.env.MASTER_API_KEY || 'default-dev-api-key-12345',
  jwt: {
    secret: process.env.JWT_SECRET || 'telespark_jwt_super_secret_key_2026_x!',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://telespark:telespark_secure_pass@localhost:5432/telespark_db?schema=public',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  task: {
    maxAttempts: parseInt(process.env.MAX_TASK_ATTEMPTS || '5', 10),
    defaultRetryBaseDelayMs: parseInt(process.env.DEFAULT_RETRY_BASE_DELAY_MS || '2000', 10),
    maxRetryDelayMs: parseInt(process.env.MAX_RETRY_DELAY_MS || '60000', 10),
    retryJitterMs: parseInt(process.env.RETRY_JITTER_MS || '1000', 10),
  },
  lease: {
    defaultDurationSeconds: parseInt(process.env.DEFAULT_LEASE_DURATION_SECONDS || '30', 10),
    renewIntervalSeconds: parseInt(process.env.LEASE_RENEW_INTERVAL_SECONDS || '10', 10),
    expirationCheckIntervalMs: parseInt(process.env.LEASE_EXPIRATION_CHECK_INTERVAL_MS || '5000', 10),
  },
  account: {
    defaultMaxConcurrency: parseInt(process.env.ACCOUNT_DEFAULT_MAX_CONCURRENCY || '1', 10),
    defaultCooldownSeconds: parseInt(process.env.DEFAULT_COOLDOWN_DURATION_SECONDS || '300', 10),
    maxConsecutiveFailures: parseInt(process.env.MAX_CONSECUTIVE_FAILURES_BEFORE_RESTRICTED || '5', 10),
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },
  telegram: {
    pythonPath: process.env.PYTHON_EXECUTOR_PATH || 'python',
    scriptPath: process.env.TELEGRAM_EXECUTOR_SCRIPT || 'python/telegram_executor.py',
    sessionDir: process.env.TELEGRAM_SESSION_STORAGE_DIR || 'sessions',
    simulationMode: (process.env.TELEGRAM_SIMULATION_MODE || 'true').toLowerCase() === 'true',
  },
});
