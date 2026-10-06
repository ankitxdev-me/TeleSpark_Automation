import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { UserService } from '../../user/user.service';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { UserRole, UserStatus } from '@prisma/client';

@ApiTags('Admin - User Management')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN') // Defensive: Only ADMIN can access this controller
export class UserController {
  constructor(private readonly userService: UserService) {}

  private assertCanManageUsers(admin: AuthUser) {
    const isMaster = admin?.email?.toLowerCase() === 'admin@telespark.io';
    const hasPerm = admin?.canManageUsers === true;
    if (!isMaster && !hasPerm) {
      throw new ForbiddenException(
        'Forbidden: You do not have permission to manage users. This permission must be granted by the Master Administrator.',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'List all users in tenant (Requires canManageUsers permission)' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @ApiResponse({ status: 403, description: 'Forbidden: User management permission required' })
  async findAll(@CurrentTenant() tenant: any, @CurrentUser() admin: AuthUser) {
    this.assertCanManageUsers(admin);
    return this.userService.findAllUsers(tenant.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details by ID (Requires canManageUsers permission)' })
  @ApiResponse({ status: 200, description: 'User details' })
  async findOne(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    this.assertCanManageUsers(admin);
    return this.userService.findUserById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update user status (ACTIVE, SUSPENDED, PENDING) (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
    @CurrentUser() admin: AuthUser,
  ) {
    this.assertCanManageUsers(admin);
    return this.userService.updateStatus(id, status, admin?.email);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending user registration (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User approved and activated' })
  async approve(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    this.assertCanManageUsers(admin);
    return this.userService.approveUser(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a user account (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User suspended' })
  async suspend(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    this.assertCanManageUsers(admin);
    return this.userService.suspendUser(id, admin?.email);
  }

  @Post([':id/unsuspend', ':id/activate'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsuspend / activate a user account (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User unsuspended and activated' })
  async unsuspend(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    this.assertCanManageUsers(admin);
    return this.userService.unsuspendUser(id, admin?.email);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role (promote to ADMIN or demote to USER) (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User role updated' })
  async updateRole(
    @Param('id') id: string,
    @Body('role') role: UserRole,
    @CurrentUser() admin: AuthUser,
  ) {
    this.assertCanManageUsers(admin);
    return this.userService.updateRole(id, role, admin?.email);
  }

  @Patch(':id/permissions')
  @ApiOperation({ summary: 'Grant or revoke User Management permission for an Admin (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User management permissions updated' })
  async updatePermissions(
    @Param('id') id: string,
    @Body('canManageUsers') canManageUsers: boolean,
    @CurrentUser() admin: AuthUser,
  ) {
    this.assertCanManageUsers(admin);
    return this.userService.updatePermissions(id, canManageUsers, admin?.email);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user account (Requires canManageUsers)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  async remove(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    this.assertCanManageUsers(admin);
    return this.userService.deleteUser(id, admin?.email);
  }
}
