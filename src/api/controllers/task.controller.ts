import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiSecurity } from '@nestjs/swagger';
import { TaskService } from '../../task/task.service';
import { CreateTaskDto } from '../../task/dtos/create-task.dto';
import { QueryTasksDto } from '../../task/dtos/query-tasks.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { Tenant } from '@prisma/client';

@ApiTags('Tasks')
@ApiSecurity('apiKey')
@UseGuards(AuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create and enqueue a new Telegram task' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Unique idempotency key' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  async create(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: CreateTaskDto,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    if (idempotencyHeader && !dto.idempotencyKey) {
      dto.idempotencyKey = idempotencyHeader;
    }
    return this.taskService.create(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List and filter tasks for the current tenant' })
  async findAll(@CurrentTenant() tenant: Tenant, @Query() query: QueryTasksDto) {
    return this.taskService.findAll(tenant.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a task by ID including attempts and events' })
  async findOne(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.taskService.findOne(tenant.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending or queued task' })
  async cancel(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.taskService.cancel(tenant.id, id, reason);
  }
}
