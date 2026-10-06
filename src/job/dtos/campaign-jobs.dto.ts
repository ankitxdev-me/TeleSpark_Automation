import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateJoinJobDto {
  @ApiPropertyOptional({
    description: 'Target channel or group link or username (e.g. @group_username, https://t.me/channel, https://t.me/+invite_hash)',
    example: 'https://t.me/channel_username',
  })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({
    description: 'Alias for target',
  })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({
    description: 'Action type (e.g. JOIN)',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'Operation mode',
  })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiPropertyOptional({
    description: 'Number of accounts to join with (defaults to 1 or available accounts)',
    example: 2,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLimit?: number;

  @ApiPropertyOptional({
    description: 'Specific account IDs to use. If omitted, active accounts with canJoinChat capability are auto-selected.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    description: 'Delay in seconds between successive joins (default: 3s)',
    example: 3,
    default: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  intervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Alias for intervalSeconds',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Minimum delay in seconds for random variable delay',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Maximum delay in seconds for random variable delay',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Custom delays sequence for sequential tasks',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  customDelays?: number[];

  @ApiPropertyOptional({
    description: 'Delay mode: fixed | random | custom',
  })
  @IsOptional()
  @IsString()
  delayMode?: string;
}

export class CreateLeaveJobDto {
  @ApiPropertyOptional({
    description: 'Target channel or group link or username to leave',
    example: 'https://t.me/channel_username',
  })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({
    description: 'Alias for target',
  })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({
    description: 'Action type (e.g. LEAVE)',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'Operation mode',
  })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiPropertyOptional({
    description: 'Number of accounts to leave with (defaults to 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLimit?: number;

  @ApiPropertyOptional({
    description: 'Specific account IDs to use. If omitted, active accounts are auto-selected.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    description: 'Delay in seconds between successive leaves (default: 2s)',
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
    description: 'Minimum delay in seconds for random variable delay',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Maximum delay in seconds for random variable delay',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Custom delays sequence for sequential tasks',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  customDelays?: number[];

  @ApiPropertyOptional({
    description: 'Delay mode: fixed | random | custom',
  })
  @IsOptional()
  @IsString()
  delayMode?: string;
}

export class CreateDmJobDto {
  @ApiPropertyOptional({
    description: 'Operation mode (e.g. SINGLE_USER, BULK_USERS)',
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
    description: 'Single recipient username or link (e.g. @username)',
    example: '@target_user',
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description: 'Alias for recipient',
  })
  @IsOptional()
  @IsString()
  user?: string;

  @ApiPropertyOptional({
    description: 'Alias for recipient',
  })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({
    description: 'List of recipient usernames or links (for "Message every user" / bulk DM workflow)',
    example: ['@user1', '@user2', '@user3'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiPropertyOptional({
    description: 'Alias for recipients',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  users?: string[];

  @ApiPropertyOptional({
    description: 'Alias for recipients',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targets?: string[];

  @ApiPropertyOptional({
    description: 'Single message text to send across all recipients or accounts',
    example: 'Hello, welcome to our community!',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'List of messages to send line-by-line or rotate across accounts',
    example: ['hello', 'first message', 'second message'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messages?: string[];

  @ApiPropertyOptional({
    description: 'Specific account IDs to use. If omitted, active accounts are auto-selected and rotated.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    description: 'Number of accounts to use',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLimit?: number;

  @ApiPropertyOptional({
    description: 'Delay in seconds between successive messages (default: 3s)',
    example: 3,
    default: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  intervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Alias for intervalSeconds',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Minimum delay in seconds for random variable delay',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Maximum delay in seconds for random variable delay',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Custom delays sequence for sequential tasks',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  customDelays?: number[];

  @ApiPropertyOptional({
    description: 'Delay mode: fixed | random | custom',
  })
  @IsOptional()
  @IsString()
  delayMode?: string;
}

export class CreateGroupMessageJobDto {
  @ApiPropertyOptional({
    description: 'Group message mode (e.g. SINGLE_GROUP, MULTI_GROUP)',
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
    description: 'Single group link or username (e.g. @group_username)',
    example: '@group_username',
  })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({
    description: 'List of group links or usernames (alias for targetChats)',
    example: ['@group1', '@group2', '@group3'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groups?: string[];

  @ApiPropertyOptional({
    description: 'List of group links or usernames (alias for groups)',
    example: ['@group1', '@group2'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetChats?: string[];

  @ApiPropertyOptional({
    description: 'Alias for groups',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chats?: string[];

  @ApiPropertyOptional({
    description: 'Alias for groups',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targets?: string[];

  @ApiPropertyOptional({
    description: 'Single message text to broadcast across groups or accounts',
    example: 'Important announcement for all groups!',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'List of messages to send line-by-line to a group from multiple accounts',
    example: ['Message 1', 'Message 2'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messages?: string[];

  @ApiPropertyOptional({
    description: 'Specific account IDs to use. If omitted, active accounts are auto-selected and rotated.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    description: 'Number of accounts to use',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLimit?: number;

  @ApiPropertyOptional({
    description: 'Delay in seconds between messages (default: 3s)',
    example: 3,
    default: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  intervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Alias for intervalSeconds',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Minimum delay in seconds for random variable delay',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Maximum delay in seconds for random variable delay',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDelaySeconds?: number;

  @ApiPropertyOptional({
    description: 'Custom delays sequence for sequential tasks',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  customDelays?: number[];

  @ApiPropertyOptional({
    description: 'Delay mode: fixed | random | custom',
  })
  @IsOptional()
  @IsString()
  delayMode?: string;
}
