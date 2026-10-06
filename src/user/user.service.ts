import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';

export const MASTER_ADMIN_EMAIL = 'admin@telespark.io';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user;
  }

  /**
   * Update a user's status with Master Admin protection
   */
  async updateStatus(userId: string, newStatus: UserStatus, currentAdminEmail?: string) {
    if (![UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.PENDING].includes(newStatus)) {
      throw new BadRequestException(`Invalid user status: ${newStatus}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Defensive Guard: Master Admin protection
    if (user.email.toLowerCase() === MASTER_ADMIN_EMAIL && newStatus !== UserStatus.ACTIVE) {
      throw new BadRequestException(
        `The master administrator (${MASTER_ADMIN_EMAIL}) cannot be suspended or deactivated.`,
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        updatedAt: true,
      },
    });
  }

  async approveUser(userId: string) {
    return this.updateStatus(userId, UserStatus.ACTIVE);
  }

  async suspendUser(userId: string, currentAdminEmail?: string) {
    return this.updateStatus(userId, UserStatus.SUSPENDED, currentAdminEmail);
  }

  async unsuspendUser(userId: string, currentAdminEmail?: string) {
    return this.updateStatus(userId, UserStatus.ACTIVE, currentAdminEmail);
  }

  /**
   * Promote or demote user roles with Master Admin control
   */
  async updateRole(userId: string, newRole: UserRole, currentAdminEmail?: string) {
    if (![UserRole.ADMIN, UserRole.USER].includes(newRole)) {
      throw new BadRequestException(`Invalid role: ${newRole}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Defensive Guard: Master Admin protection
    if (user.email.toLowerCase() === MASTER_ADMIN_EMAIL && newRole !== UserRole.ADMIN) {
      throw new BadRequestException(
        `The master administrator (${MASTER_ADMIN_EMAIL}) cannot be demoted from ADMIN role.`,
      );
    }

    // When demoted to USER, automatically revoke canManageUsers
    const updateData: any = { role: newRole };
    if (newRole === UserRole.USER) {
      updateData.canManageUsers = false;
    } else if (newRole === UserRole.ADMIN && user.status === UserStatus.PENDING) {
      updateData.status = UserStatus.ACTIVE;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Grant or revoke user management permission for an admin
   */
  async updatePermissions(userId: string, canManageUsers: boolean, currentAdminEmail?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Defensive Guard: Master Admin protection
    if (user.email.toLowerCase() === MASTER_ADMIN_EMAIL && canManageUsers === false) {
      throw new BadRequestException(
        `Master Administrator (${MASTER_ADMIN_EMAIL}) user management permission cannot be revoked.`,
      );
    }

    // Only ADMINs can have canManageUsers = true
    if (canManageUsers && user.role !== UserRole.ADMIN) {
      throw new BadRequestException(
        'User must be promoted to ADMIN before user management permissions can be granted.',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { canManageUsers: Boolean(canManageUsers) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        updatedAt: true,
      },
    });
  }

  async deleteUser(userId: string, currentAdminEmail?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Defensive Guard: Master Admin protection
    if (user.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
      throw new BadRequestException(
        `The master administrator (${MASTER_ADMIN_EMAIL}) cannot be deleted.`,
      );
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true, message: `User ${user.email} removed` };
  }
}
