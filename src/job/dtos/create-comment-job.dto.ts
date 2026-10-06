import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export const DEFAULT_COMMENT_MESSAGES = [
  'Legit project',
  'Nice',
  'Wonderful',
  'Where is the t-g',
  'Nice name 😅',
  'ok',
  'Thank you',
  'Alright',
  'Great',
  'Has anyone getting airdrop successfully??',
  'Good evening',
  'Hello',
  'Is it real?',
  'G',
  'Good luck everyone',
  'Wishing good future',
  'Keep shining',
  'Okay thanks 🙏',
  'Love the project',
  'How did it work',
  '🙏',
  'Productivity growth',
  'This is a very elevating growth',
  'LFG',
  'Happy for everyone',
  'Great efforts',
  'Okay thanks',
  'Alright',
  'Is it new project?',
  'Riskyyyy',
  'Good',
  'To the moon 🚀',
  'Solid team and vision',
  'Excited for this journey!',
  'When next update?',
  'Bullish on this one 🔥',
  'Great community vibes',
  'Keep building guys',
  'Very promising roadmap',
  'Joined and ready',
  'Huge potential here',
  'Amazing work guys',
  'Let\'s go team!',
  'Any announcements today?',
  'Best project of the week',
  'Always supporting this 🙌',
  'Super clean and fast',
  'Let\'s see how it goes',
  'Looking forward to the rewards',
  'Big things ahead',
  'Check this out guys!',
  'Happy to be part of this',
  'Impressive progress',
  'Can\'t wait for next phase',
  'Keep it up!',
  'Count me in 🤝',
  'Very nice development',
  'Let\'s grow together',
  'Everything looks smooth',
  'Top tier community',
];

export enum CommentMode {
  SINGLE_ACCOUNT = 'SINGLE_ACCOUNT',
  MULTIPLE_ACCOUNTS = 'MULTIPLE_ACCOUNTS',
}

export class CreateCommentJobDto {
  @ApiPropertyOptional({
    description:
      'Commenting mode: SINGLE_ACCOUNT (1 account posts all comments) or MULTIPLE_ACCOUNTS (alternates between 2 or more accounts).',
    enum: CommentMode,
    default: CommentMode.MULTIPLE_ACCOUNTS,
  })
  @IsOptional()
  @IsString()
  mode?: CommentMode;

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
    description: 'Custom message pool. If omitted, uses built-in predefined messages ("hello", "hi", "done", "task done", etc.)',
    example: ['hello', 'hi', 'done', 'task done'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messages?: string[];

  @ApiPropertyOptional({
    description: 'Alias for messages',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  comments?: string[];

  @ApiPropertyOptional({
    description: 'Total number of comments to post (e.g. 5, 10). Default is 1.',
    example: 5,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Alias for count',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  commentCount?: number;

  @ApiPropertyOptional({
    description: 'Explicit list of account IDs to use (e.g. single account ID, or 2 specific account IDs). If omitted, active accounts are auto-selected.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    description: 'Maximum number of accounts to rotate across when auto-selecting (default: 2 accounts).',
    example: 2,
    default: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAccounts?: number;

  @ApiPropertyOptional({
    description: 'Whether to randomly pick messages from the pool (default: true). If false, cycles sequentially.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useRandomMessages?: boolean;

  @ApiPropertyOptional({
    description: 'Delay in seconds between consecutive comments to avoid flood limits (default: 3s)',
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
    description: 'Alias for maxAccounts or count',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLimit?: number;

  @ApiPropertyOptional({
    description: 'Action type',
  })
  @IsOptional()
  @IsString()
  action?: string;

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
