import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ApiCode } from './common/constants/api-code.enum';
import { ValidationError } from 'class-validator';

function getAllowedOrigins(config: ConfigService): string[] {
  const origins = new Set<string>();
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3001');
  origins.add(frontendUrl);

  const extra = config.get<string>('CORS_ORIGINS', '');
  for (const o of extra.split(',').map((s) => s.trim()).filter(Boolean)) {
    origins.add(o);
  }

  return [...origins];
}

function isDevNgrokOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io') || host.endsWith('.ngrok.app');
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Bảo mật HTTP headers
  app.use(helmet());

  // Phục vụ file upload (avatar)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Prefix toàn cục
  app.setGlobalPrefix('api');

  // Versioning
  app.enableVersioning({ type: VersioningType.URI });

  const allowedOrigins = getAllowedOrigins(config);
  const isProduction = config.get<string>('NODE_ENV', 'development') === 'production';

  app.enableCors({
    origin: (origin, callback) => {
      // Postman / server-to-server
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Dev: cho phép tunnel ngrok (URL đổi mỗi lần chạy)
      if (!isProduction && isDevNgrokOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });

  // Validation toàn cục — gắn code VALIDATION_ERROR + giữ nguyên list message
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = flattenValidationErrors(errors);
        return new BadRequestException({
          statusCode: 400,
          code: ApiCode.VALIDATION_ERROR,
          message: messages,
        });
      },
    }),
  );

  // Exception filter toàn cục
  app.useGlobalFilters(new HttpExceptionFilter());

  // Transform interceptor toàn cục
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('StrangerConfide API')
    .setDescription('REST API docs cho StrangerConfide backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });
  SwaggerModule.setup('docs', app, swaggerDocument, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 StrangerConfide Backend chạy tại: http://localhost:${port}/api`);
  console.log(`📚 Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap();

/** Trải mọi ValidationError (kể cả nested) thành mảng "field <message>" */
function flattenValidationErrors(errors: ValidationError[], parent = ''): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const path = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const msg of Object.values(err.constraints)) {
        // Đảm bảo message bắt đầu bằng tên field để filter parse được
        out.push(msg.startsWith(path) ? msg : `${path} ${msg}`);
      }
    }
    if (err.children?.length) {
      out.push(...flattenValidationErrors(err.children, path));
    }
  }
  return out;
}
