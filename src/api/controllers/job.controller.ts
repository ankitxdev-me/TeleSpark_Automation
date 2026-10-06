import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { JobService } from '../../job/job.service';
import { CreateJobDto } from '../../job/dtos/create-job.dto';
import { CreateReactionJobDto } from '../../job/dtos/create-reaction-job.dto';
import { CreateCommentJobDto } from '../../job/dtos/create-comment-job.dto';
import {
  CreateJoinJobDto,
  CreateLeaveJobDto,
  CreateDmJobDto,
  CreateGroupMessageJobDto,
} from '../../job/dtos/campaign-jobs.dto';
import { QueryTasksDto } from '../../task/dtos/query-tasks.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { Tenant } from '@prisma/client';

@ApiTags('Jobs')
@ApiSecurity('apiKey')
@UseGuards(AuthGuard)
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  @ApiOperation({ summary: 'List recent campaign execution jobs for live activity feed' })
  @ApiResponse({ status: 200, description: 'List of campaign jobs' })
  async findAll(@CurrentTenant() tenant: Tenant, @Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 30;
    return this.jobService.findAll(tenant.id, lim);
  }

  @Post(['reactions', 'reaction'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dispatch a multi-account reaction campaign on a post with round-robin emoji rotation',
    description:
      'Verifies available active accounts, allocates 1 reaction per unique account, and distributes the specified reaction emojis in rotation order.',
  })
  @ApiResponse({ status: 201, description: 'Reaction campaign job registered and tasks dispatched' })
  async createReactionJob(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReactionJobDto,
  ) {
    return this.jobService.createReactionJob(tenant.id, dto, user?.email);
  }

  @Post(['comments', 'comment'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dispatch a multi-account or single-account comment campaign on a post with alternating rotation and random message pool',
    description:
      'Dispatches multiple comments on a post across 1 or up to 2 (or more) active accounts, alternating between Account 1 and Account 2, using predefined random messages ("hello", "hi", "done", "task done", etc.) or custom messages.',
  })
  @ApiResponse({ status: 201, description: 'Comment campaign job registered and tasks dispatched' })
  async createCommentJob(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCommentJobDto,
  ) {
    return this.jobService.createCommentJob(tenant.id, dto, user?.email);
  }

  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Community Join Campaign: Join a group or channel with N accounts',
    description: 'Rotates active eligible accounts to join a target group or channel link with anti-flood delay.',
  })
  @ApiResponse({ status: 201, description: 'Join campaign job registered and tasks dispatched' })
  async createJoinJob(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJoinJobDto,
  ) {
    return this.jobService.createJoinJob(tenant.id, dto, user?.email);
  }

  @Post('leave')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Community Leave Campaign: Leave a group or channel with N accounts',
    description: 'Rotates active accounts to leave a target group or channel link with anti-flood delay.',
  })
  @ApiResponse({ status: 201, description: 'Leave campaign job registered and tasks dispatched' })
  async createLeaveJob(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveJobDto,
  ) {
    return this.jobService.createLeaveJob(tenant.id, dto, user?.email);
  }

  @Post(['dms', 'dm'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Direct Messaging Campaign: Message single user with multiple messages, or message every user across multiple accounts',
    description:
      'Supports "Message every user" (rotating sender accounts across recipient list) and multi-message conversations to a single user.',
  })
  @ApiResponse({ status: 201, description: 'DM campaign job registered and tasks dispatched' })
  async createDmJob(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDmJobDto,
  ) {
    return this.jobService.createDmJob(tenant.id, dto, user?.email);
  }

  @Post(['group-messages', 'group-message'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Group Messaging Campaign: Bulk messages to a single group, or broadcast message across multiple groups',
    description:
      'Supports sending line-by-line messages to a group from multiple accounts, or broadcasting a single announcement across a list of groups.',
  })
  @ApiResponse({ status: 201, description: 'Group messaging campaign job registered and tasks dispatched' })
  async createGroupMessageJob(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateGroupMessageJobDto,
  ) {
    return this.jobService.createGroupMessageJob(tenant.id, dto, user?.email);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an asynchronous bulk job' })
  @ApiResponse({ status: 201, description: 'Bulk job registered and tasks dispatched' })
  async create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateJobDto) {
    return this.jobService.create(tenant.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bulk job progress and status' })
  async findOne(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.jobService.findOne(tenant.id, id);
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'List tasks belonging to this bulk job' })
  async findTasks(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.jobService.findJobTasks(tenant.id, id, query);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an in-progress bulk job and its non-terminal tasks' })
  async cancel(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.jobService.cancel(tenant.id, id);
  }
}
