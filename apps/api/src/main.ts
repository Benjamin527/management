import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

interface ExpressApplication {
  set(setting: string, value: unknown): void;
}

export function configureTrustProxy(app: INestApplication) {
  const expressApp = app.getHttpAdapter().getInstance() as ExpressApplication;
  expressApp.set('trust proxy', 'loopback');
}

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureTrustProxy(app);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}

if (require.main === module) void bootstrap();
