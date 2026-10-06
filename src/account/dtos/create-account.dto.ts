import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';

export class AccountCapabilitiesDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canSendMessage?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canReplyMessage?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canComment?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canReaction?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canJoinChat?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canLeaveChat?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canForwardMessage?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canSendMedia?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canEditMessage?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canDeleteMessage?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canGetMessages?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canGetChatInfo?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canGetMembers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canGetAdmins?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canGroupOperation?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canChannelOperation?: boolean;
}

export class CreateAccountDto {
  @ApiProperty({ description: 'International format phone number', example: '+12025550143' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Telegram username', example: 'tg_user_1' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Telethon StringSession data' })
  @IsOptional()
  @IsString()
  sessionString?: string;

  @ApiPropertyOptional({ description: 'Telegram App API ID' })
  @IsOptional()
  @IsInt()
  apiId?: number;

  @ApiPropertyOptional({ description: 'Telegram App API Hash' })
  @IsOptional()
  @IsString()
  apiHash?: string;

  @ApiPropertyOptional({ description: 'Maximum simultaneous operations', default: 1, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrency?: number;

  @ApiPropertyOptional({ type: () => AccountCapabilitiesDto })
  @IsOptional()
  capabilities?: AccountCapabilitiesDto;
}
