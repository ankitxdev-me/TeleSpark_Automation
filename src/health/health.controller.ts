import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../auth/auth.guard';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../common/constants/queues.constant';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.TELEGRAM_TASKS)
    private readonly taskQueue: Queue,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Application process is alive' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe checking database and queue dependencies' })
  @ApiResponse({ status: 200, description: 'Application is ready to accept traffic' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unavailable' })
  async readiness(@Res() res: Response) {
    let dbStatus = 'down';
    let redisStatus = 'down';
    let isHealthy = true;

    // 1. Check PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch (e) {
      isHealthy = false;
      dbStatus = `error: ${e.message}`;
    }

    // 2. Check Redis / BullMQ
    try {
      await this.taskQueue.getJobCounts();
      redisStatus = 'up';
    } catch (e) {
      isHealthy = false;
      redisStatus = `error: ${e.message}`;
    }

    const payload = {
      status: isHealthy ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
      },
    };

    return res.status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(payload);
  }
}
