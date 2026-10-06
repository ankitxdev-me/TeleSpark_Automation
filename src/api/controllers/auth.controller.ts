import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { AuthService } from '../../auth/auth.service';
import { SignupDto } from '../../auth/dtos/signup.dto';
import { LoginDto } from '../../auth/dtos/login.dto';
import { Public, AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Register a new user account (defaults to PENDING admin approval)' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user with email and password' })
  @ApiResponse({ status: 200, description: 'Authentication successful, returns JWT token' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account pending approval' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Get profile and permissions of currently authenticated user' })
  @ApiResponse({ status: 200, description: 'Returns authenticated user info' })
  async getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }
}
