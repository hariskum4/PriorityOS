import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { corsOrigins, isProduction, BODY_LIMIT } from './common/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Standard header hardening. This API serves JSON to a native app and a web
  // build, so the CSP default — which assumes it is serving an HTML document —
  // is off rather than fought with.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  // Entries are prose, not uploads. A cap stops one request becoming a
  // memory-exhaustion lever.
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  // Production must name its origins: corsOrigins() throws rather than fall
  // back to reflecting every origin with credentials.
  app.enableCors({ origin: corsOrigins(), credentials: true });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Priority API running on :${port}${isProduction ? '' : ' (development)'}`);
}
bootstrap();
