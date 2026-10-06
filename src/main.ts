import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = await app.resolve(AppLogger);
  app.useLogger(logger);

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Enable CORS
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/', 'admin', 'admin/(.*)', 'docs', 'docs/(.*)'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('TeleSpark Telegram Automation API')
    .setDescription(
      'Production-ready Telegram Automation API with MTProto, BullMQ queues, strict task state machine, RBAC authentication, account leasing, and multi-tenant isolation.',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
    .addBearerAuth()
    .addTag('Tasks', 'Task lifecycle, scheduling, queuing, and cancellation')
    .addTag('Jobs', 'Asynchronous bulk operation tracking and task decomposition')
    .addTag('Accounts', 'Telegram account pool, capabilities, health metrics, and lifecycle')
    .addTag('Tenants', 'Multi-tenant provisioning and API key issuance')
    .addTag('Health', 'Liveness and readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`TeleSpark Automation API is running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Interactive Swagger OpenAPI docs available at http://localhost:${port}/docs`);
}

bootstrap();
