import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { SignupDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { UserRole, UserStatus } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  name?: string | null;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('jwt.secret') ||
      'telespark_jwt_super_secret_key_2026_x!';
    this.jwtExpiresIn =
      this.configService.get<string>('jwt.expiresIn') || '7d';
  }

  async onModuleInit() {
    await this.seedDefaultAdmin();
  }

  /**
   * Automatically ensure at least one default tenant and super-admin exist
   */
  private async seedDefaultAdmin() {
    try {
      let tenant = await this.prisma.tenant.findFirst({
        where: { isActive: true },
      });

      if (!tenant) {
        tenant = await this.prisma.tenant.create({
          data: {
            name: 'Default Organization',
            apiKey:
              this.configService.get<string>('masterApiKey') ||
              'default-dev-api-key-12345',
            isActive: true,
          },
        });
        this.logger.log(`Created default tenant: ${tenant.id}`);
      }

      const adminEmail = 'admin@telespark.io';
      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: adminEmail },
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash('Admin@12345', 10);
        const adminUser = await this.prisma.user.create({
          data: {
            email: adminEmail,
            passwordHash: hashedPassword,
            name: 'System Administrator',
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            tenantId: tenant.id,
          },
        });
        this.logger.log(
          `Default Admin seeded: email=${adminUser.email} (password: Admin@12345)`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Error during admin seeding: ${err.message}`);
    }
  }

  /**
   * User registration: Creates user with status PENDING so admin must approve
   */
  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // Assign to active default tenant
    let tenant = await this.prisma.tenant.findFirst({
      where: { isActive: true },
    });
    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          name: 'Default Tenant',
          apiKey: `key-${Date.now()}`,
          isActive: true,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash: hashedPassword,
        name: dto.name?.trim() || null,
        role: UserRole.USER,
        status: UserStatus.PENDING, // Defensive: New users must be approved by admin
        tenantId: tenant.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `New user registered: ${user.email} (Status: PENDING admin approval)`,
    );

    return {
      message:
        'Registration successful. Your account is pending administrator approval before you can perform tasks.',
      user,
    };
  }

  /**
   * User login: Verifies password and checks active status
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException(
        'Account approval pending: An administrator must approve your account before you can log in.',
      );
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'Account suspended: Please contact the system administrator.',
      );
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException('Tenant account is disabled');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      name: user.name,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn as any,
    });

    this.logger.log(`User logged in: ${user.email} (Role: ${user.role})`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        canManageUsers: user.canManageUsers,
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Verify and decode a JWT bearer token
   */
  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  /**
   * Fetch current user profile
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        tenantId: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  /**
   * Validate user existence, active status, and real-time role directly from database
   */
  async validateActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        canManageUsers: true,
        tenantId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended by the administrator. Please contact support.');
    }

    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('Your account is pending administrator approval before you can access the system.');
    }

    return user;
  }
}
