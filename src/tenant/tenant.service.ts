import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(TenantService.name);
  }

  async onModuleInit() {
    await this.ensureDefaultTenant();
  }

  /**
   * Automatically initializes a default development tenant if none exists.
   */
  async ensureDefaultTenant(): Promise<Tenant> {
    const masterApiKey = this.configService.get<string>('masterApiKey', 'default-dev-api-key-12345');
    let tenant = await this.prisma.tenant.findUnique({
      where: { apiKey: masterApiKey },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          name: 'Default Organization',
          apiKey: masterApiKey,
          isActive: true,
        },
      });
      this.logger.log(`Initialized default tenant: ${tenant.id} (apiKey: ${masterApiKey})`);
    }

    return tenant;
  }

  async createTenant(name: string): Promise<Tenant> {
    const apiKey = `tspk_${uuidv4().replace(/-/g, '')}`;
    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        apiKey,
        isActive: true,
      },
    });

    this.logger.log(`Created new tenant: ${tenant.id} (${name})`);
    return tenant;
  }

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({
      where: { apiKey },
    });
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }
}
