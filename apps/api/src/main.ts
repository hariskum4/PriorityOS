import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // CORS: open in dev, locked to explicit origins in production.
  // Set CORS_ORIGINS to a comma-separated list of your web domain(s).
  const origins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors(
    origins?.length
      ? { origin: origins, credentials: true }
      : {}, // dev / unset → reflect all
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Priority API running on :${port}`);
}
bootstrap();
