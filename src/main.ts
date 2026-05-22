import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

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
