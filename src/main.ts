import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Bảo mật HTTP headers
  app.use(helmet());

  // Prefix toàn cục
  app.setGlobalPrefix('api');

  // Versioning
  app.enableVersioning({ type: VersioningType.URI });

  // CORS - chỉ cho phép frontend
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL', 'http://localhost:3001'),
    credentials: true,
  });

  // Validation toàn cục
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Exception filter toàn cục
  app.useGlobalFilters(new HttpExceptionFilter());

  // Transform interceptor toàn cục
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 StrangerConfide Backend chạy tại: http://localhost:${port}/api`);
}

bootstrap();
