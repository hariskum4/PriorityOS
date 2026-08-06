import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure';
import { isProduction } from './common/env';

/**
 * The long-lived process — local development, and any host that runs one.
 *
 * The serverless entry point at `/api/index.ts` boots the same application
 * with the same `configureApp`; all that differs is that this one owns a port
 * and stays up, which is why the `@Cron` decorators only ever fire here.
 */
async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));

  // 3001, not 3000. The old default collided with whatever else a developer
  // has on the conventional port, and losing the race means this API silently
  // fails to start while an unrelated process answers requests meant for it.
  // Everything that addresses this service — apps/api/.env, the mobile client's
  // dev fallback, .claude/launch.json — agrees on 3001.
  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Priority API running on :${port}${isProduction ? '' : ' (development)'}`);
}
bootstrap();
