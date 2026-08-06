/**
 * The first six weeks.
 *
 * History behind the Today sky was written by a Monday 03:00 cron and nothing
 * else. So a new account had no history for up to a week, a single point the
 * week after, and — since the trend engines refuse to speak below six samples —
 * nothing resembling a trend for a month and a half. Someone joins a tool for
 * living deliberately and it sits visibly inert through exactly the period in
 * which they decide whether to keep it.
 *
 * Caught on a real account: onboarded, sixteen days in, zero samples.
 *
 * So the sample is now written wherever a life is recomputed, which is every
 * write path plus the end of onboarding. These tests hold that: day one has a
 * point, the week stays one row however many times it is written, and a failure
 * to keep history can never fail the write that prompted it.
 */
import { describe, it, expect, vi } from 'vitest';
import { ScoringService } from './scoring.service';

const DOMAINS = ['health', 'family', 'purpose'].map((domainType, i) => ({
  id: `d${i}`, domainType, priorityRank: i + 1,
  flaggedAsNeglected: false, regretRiskFlagged: false,
  attentionScore: 0, prevAttentionScore: 0, lastMeaningfulActionAt: null,
}));

/** Records every sample write so a test can assert on the history kept. */
function fakePrisma(opts: { timezone?: string | null; failSamples?: boolean } = {}) {
  const samples: any[] = [];
  return {
    samples,
    client: {
      appConfig: { findUnique: async () => null },
      lifeDomain: { findMany: async () => DOMAINS, update: async () => ({}) },
      mission: { findMany: async () => [] },
      habit: { findMany: async () => [] },
      journalEntry: { findMany: async () => [] },
      /* `groupBy` replaced twelve per-domain counts with one query — see
         `recalcUserDomains`. `count` stays because other callers still use it. */
      goal: { count: async () => 0, groupBy: async () => [] },
      user: {
        findUnique: async () => ({ timezone: opts.timezone ?? 'Asia/Kolkata' }),
      },
      domainAttentionSample: {
        upsert: async (args: any) => {
          if (opts.failSamples) throw new Error('history write failed');
          const key = args.where.userId_domainType_weekOf;
          const at = samples.findIndex(
            (s) => s.domainType === key.domainType
              && s.weekOf.getTime() === key.weekOf.getTime(),
          );
          if (at >= 0) samples[at] = { ...samples[at], ...args.update };
          else samples.push({ ...key, ...args.create });
          return {};
        },
      },
    } as any,
  };
}

describe('a life records its own history as it is lived', () => {
  it('keeps a sample the first time a life is computed, not a week later', async () => {
    // Onboarding ends with a recompute, so this is day one for a new account.
    const p = fakePrisma();
    await new ScoringService(p.client).recalcUserDomains('u1');

    expect(p.samples).toHaveLength(DOMAINS.length);
    expect(p.samples.map((s) => s.domainType).sort()).toEqual(['family', 'health', 'purpose']);
  });

  it('keeps one row per week however often the week is recomputed', async () => {
    // Ten writes in a day must leave a week of history, not ten weeks of it.
    const p = fakePrisma();
    const svc = new ScoringService(p.client);
    for (let i = 0; i < 10; i++) await svc.recalcUserDomains('u1');

    expect(p.samples).toHaveLength(DOMAINS.length);
    expect(new Set(p.samples.map((s) => s.weekOf.getTime())).size).toBe(1);
  });

  it('files the week in the person’s own zone', async () => {
    // The stored key is UTC midnight of their local Monday.
    const p = fakePrisma({ timezone: 'Pacific/Kiritimati' });
    await new ScoringService(p.client).recalcUserDomains('u1');
    for (const s of p.samples) {
      expect(s.weekOf.getUTCDay()).toBe(1);
      expect(s.weekOf.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
    }
  });

  it('never fails the write that prompted it', async () => {
    // Completing a mission must not fail because history could not be kept.
    const p = fakePrisma({ failSamples: true });
    await expect(new ScoringService(p.client).recalcUserDomains('u1')).resolves.not.toThrow();
    expect(p.samples).toHaveLength(0);
  });

  it('says nothing about a life with no domains', async () => {
    const p = fakePrisma();
    p.client.lifeDomain.findMany = async () => [];
    await new ScoringService(p.client).recalcUserDomains('u1');
    expect(p.samples).toHaveLength(0);
  });

  it('records what it just computed, not what was there before', async () => {
    const p = fakePrisma();
    const seen: any[] = [];
    p.client.lifeDomain.update = async (args: any) => { seen.push(args.data); return {}; };
    await new ScoringService(p.client).recalcUserDomains('u1');

    for (const s of p.samples) {
      const computed = seen[DOMAINS.findIndex((d) => d.domainType === s.domainType)];
      expect(s.importance).toBe(computed.importanceScore);
      expect(s.attention).toBe(computed.attentionScore);
    }
  });
});
