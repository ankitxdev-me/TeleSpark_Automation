import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class VerifyCodeDto {
  @ApiProperty({ description: 'International format phone number', example: '+919541650687' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Phone code hash returned by /accounts/send-code (optional if cached)' })
  @IsOptional()
  @IsString()
  phoneCodeHash?: string;

  @ApiProperty({ description: 'Verification code (OTP) received on Telegram/SMS', example: '12345' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ description: 'Two-Step Verification (2FA) cloud password if enabled' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Optional label or username for this account' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Maximum simultaneous operations', default: 1, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrency?: number;
}
