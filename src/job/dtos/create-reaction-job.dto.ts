import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateReactionJobDto {
  @ApiPropertyOptional({
    description: 'Direct Telegram post URL (e.g. https://t.me/ForPayoutRecords/728)',
    example: 'https://t.me/ForPayoutRecords/728',
  })
  @IsOptional()
  @IsString()
  postUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for postUrl',
  })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({
    description: 'Target channel username or chat ID (if postUrl is not provided)',
    example: 'ForPayoutRecords',
  })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional({
    description: 'Message / Post ID (if postUrl is not provided)',
    example: 728,
  })
  @IsOptional()
  @IsNumber()
  messageId?: number;

  @ApiPropertyOptional({
    description: 'List of reaction emojis to distribute across accounts in rotation order',
    example: ['👍', '❤️', '🔥'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reactions?: string[];

  @ApiPropertyOptional({
    description: 'Alias for reactions',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emojis?: string[];

  @ApiPropertyOptional({
    description: 'Total number of reactions requested (defaults to reactions.length or available accounts)',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  reactionCount?: number;

  @ApiPropertyOptional({
    description: 'Delay in seconds between successive reactions to avoid flood limits (default: 2s)',
    example: 2,
    default: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  intervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Alias for intervalSeconds',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLimit?: number;

  @ApiPropertyOptional({
    description: 'Operation mode',
  })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiPropertyOptional({
    description: 'Action type',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'If true, will proceed with available active accounts even if count > availableAccounts. If false, fails with 400 when accounts are insufficient.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowPartial?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum delay in seconds for random variable delay (e.g. 10)',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Maximum delay in seconds for random variable delay (e.g. 50)',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Specific custom delays in seconds for sequential tasks, e.g. [10, 50, 20, 15]',
    example: [10, 50, 20, 15],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  customDelays?: number[];

  @ApiPropertyOptional({
    description: 'Delay mode: fixed | random | custom',
    example: 'random',
  })
  @IsOptional()
  @IsString()
  delayMode?: string;
}
