/**
 * The scheduler's verb has to reach a handler.
 *
 * Vercel Cron sends GET. The routes were POST-only, so adding GET was part of
 * moving the API onto Vercel — and the first attempt stacked `@Get('daily')`
 * and `@Post('daily')` on one method, which reads exactly as if it registers
 * both. Nest keeps one. The deployment answered GET with 401 and POST with
 * 404, and the comment sitting above the code said both worked.
 *
 * Nothing in the type system, the unit tests or the build had an opinion. The
 * only thing that noticed was curling the deployed URL, which is not a thing
 * that happens on every change.
 *
 * So this reads the metadata Nest itself routes from: for each handler, the
 * path it answers on and the verb it answers to. A 404 on a nightly job is
 * the quietest possible failure — the batch simply never runs, exactly as it
 * never ran for the three weeks before any of this.
 */
import { describe, it, expect } from 'vitest';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CronController } from './cron.controller';

/** Every route this controller registers, as {method, path}. */
function routes() {
  const proto = CronController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
    .map((name) => ({
      handler: name,
      path: Reflect.getMetadata(PATH_METADATA, proto[name] as object),
      method: Reflect.getMetadata(METHOD_METADATA, proto[name] as object),
    }))
    .filter((r) => r.path !== undefined);
}

const has = (path: string, method: RequestMethod) =>
  routes().some((r) => r.path === path && r.method === method);

describe('the routes the scheduler will actually call', () => {
  it('answers GET on both jobs, which is the only verb Vercel Cron sends', () => {
    expect(has('daily', RequestMethod.GET), 'GET /cron/daily').toBe(true);
    expect(has('weekly', RequestMethod.GET), 'GET /cron/weekly').toBe(true);
  });

  it('still answers POST, for anything triggering a job by hand', () => {
    expect(has('daily', RequestMethod.POST), 'POST /cron/daily').toBe(true);
    expect(has('weekly', RequestMethod.POST), 'POST /cron/weekly').toBe(true);
  });

  it('registers four routes, not two — the bug looked like four and was two', () => {
    /* The count is the assertion that fails when somebody tidies the pair of
       handlers back into one method with two decorators on it. */
    expect(routes().filter((r) => r.path === 'daily' || r.path === 'weekly')).toHaveLength(4);
  });

  it('leaves the work on methods that are not routes themselves', () => {
    /* `daily` and `weekly` hold the job lists and are called by the four
       handlers above. If either ever picks up a path, the same job is
       registered twice under one verb. */
    const bare = routes().map((r) => r.handler);
    expect(bare).not.toContain('daily');
    expect(bare).not.toContain('weekly');
  });
});
