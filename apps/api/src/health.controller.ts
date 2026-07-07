import { Controller, Get } from '@nestjs/common';

/** Unauthenticated liveness probe for Render/Railway health checks. */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
