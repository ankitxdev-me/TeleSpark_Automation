export const QUEUE_NAMES = {
  TELEGRAM_TASKS: 'telegram-tasks',
  TASK_SCHEDULER: 'task-scheduler',
  LEASE_MONITOR: 'lease-monitor',
} as const;

export const JOB_NAMES = {
  EXECUTE_TASK: 'execute-task',
  SCHEDULE_SWEEP: 'schedule-sweep',
  LEASE_SWEEP: 'lease-sweep',
} as const;
