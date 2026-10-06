import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

export class TaskStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.CREATED]: [TaskStatus.QUEUED, TaskStatus.CANCELLED],
    [TaskStatus.QUEUED]: [
      TaskStatus.WAITING_FOR_ACCOUNT,
      TaskStatus.ASSIGNED,
      TaskStatus.CANCELLED,
    ],
    [TaskStatus.WAITING_FOR_ACCOUNT]: [
      TaskStatus.ASSIGNED,
      TaskStatus.QUEUED,
      TaskStatus.CANCELLED,
    ],
    [TaskStatus.ASSIGNED]: [
      TaskStatus.RUNNING,
      TaskStatus.REASSIGNABLE,
      TaskStatus.FAILED,
      TaskStatus.CANCELLED,
    ],
    [TaskStatus.RUNNING]: [
      TaskStatus.COMPLETED,
      TaskStatus.RETRY_WAIT,
      TaskStatus.REASSIGNABLE,
      TaskStatus.FAILED,
      TaskStatus.CANCELLED,
    ],
    [TaskStatus.RETRY_WAIT]: [TaskStatus.QUEUED, TaskStatus.CANCELLED],
    [TaskStatus.REASSIGNABLE]: [
      TaskStatus.QUEUED,
      TaskStatus.WAITING_FOR_ACCOUNT,
      TaskStatus.ASSIGNED,
      TaskStatus.CANCELLED,
    ],
    [TaskStatus.COMPLETED]: [],
    [TaskStatus.FAILED]: [],
    [TaskStatus.CANCELLED]: [],
  };

  public static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    if (from === to) return true;
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static validateTransition(from: TaskStatus, to: TaskStatus): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid state transition: Cannot change task status from '${from}' to '${to}'`,
      );
    }
  }

  public static isTerminal(status: TaskStatus): boolean {
    const terminals: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED];
    return terminals.includes(status);
  }

  public static isCancellable(status: TaskStatus): boolean {
    const cancellables: TaskStatus[] = [
      TaskStatus.CREATED,
      TaskStatus.QUEUED,
      TaskStatus.WAITING_FOR_ACCOUNT,
      TaskStatus.RETRY_WAIT,
      TaskStatus.REASSIGNABLE,
      TaskStatus.ASSIGNED,
    ];
    return cancellables.includes(status);
  }
}
