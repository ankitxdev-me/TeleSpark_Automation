import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { TenantService } from '../../tenant/tenant.service';
import { Public } from '../../auth/auth.guard';

class CreateTenantDto {
  @ApiProperty({ description: 'Organization or tenant name', example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision a new isolated tenant organization with API key' })
  @ApiResponse({ status: 201, description: 'Tenant provisioned with API key' })
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.tenantService.createTenant(dto.name);
  }
}
