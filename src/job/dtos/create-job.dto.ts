import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, ValidateNested, ArrayMinSize, IsOptional, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTaskDto } from '../../task/dtos/create-task.dto';

export class CreateJobDto {
  @ApiProperty({ description: 'Job type category', example: 'BULK_SEND_MESSAGE' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ type: [CreateTaskDto], description: 'List of individual task payloads' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];

  @ApiPropertyOptional({ description: 'Optional metadata describing the bulk job' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
