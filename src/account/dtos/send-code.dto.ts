import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

export class SendCodeDto {
  @ApiProperty({ description: 'International format phone number', example: '+919541650687' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Optional override for Telegram App API ID' })
  @IsOptional()
  @IsInt()
  apiId?: number;

  @ApiPropertyOptional({ description: 'Optional override for Telegram App API Hash' })
  @IsOptional()
  @IsString()
  apiHash?: string;
}
