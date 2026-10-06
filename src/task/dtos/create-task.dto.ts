import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { TaskPriority } from '@prisma/client';
import { TaskType } from '../../common/constants/task-types.constant';

export class CreateTaskDto {
  @ApiProperty({ enum: TaskType, example: TaskType.SEND_MESSAGE })
  @IsEnum(TaskType)
  @IsNotEmpty()
  type: TaskType;

  @ApiProperty({
    description: 'Operation-specific JSON payload',
    example: { chatId: '@telegram', text: 'Hello from TeleSpark API' },
  })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.NORMAL })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Specific required account capability tag' })
  @IsOptional()
  @IsString()
  requiredCapability?: string;

  @ApiPropertyOptional({ description: 'Optionally pin task to a specific account ID' })
  @IsOptional()
  @IsString()
  assignedAccountId?: string;

  @ApiPropertyOptional({ description: 'Maximum retry attempts before permanently failing', default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional({ description: 'Execute at or after this ISO timestamp', example: '2026-10-03T16:00:00Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Idempotency key to prevent duplicate submissions' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
