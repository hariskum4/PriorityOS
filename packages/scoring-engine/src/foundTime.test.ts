import { describe, it, expect } from 'vitest';
import { foundTime, type Candidate } from './foundTime';
import { setting } from './setting';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted|lazy|should have/i;

const walk: Candidate = {
  key: 'health.move', action: 'Move three times a week', minutes: 40,
  domain: 'health', needs: ['canMove'], neglectRisk: 50,
};
const callHome: Candidate = {
  key: 'family.call', action: 'Call home, the same day every week', minutes: 20,
  domain: 'family', needs: ['canSpeakFreely'], neglectRisk: 90,
};
const deepBlock: Candidate = {
  key: 'career.deep', action: 'One block nobody is allowed to interrupt', minutes: 90,
  domain: 'career', needs: ['hasScreen'], neglectRisk: 20,
};
const learn: Candidate = {
  key: 'growth.daily', action: 'Thirty minutes of learning, daily', minutes: 30,
  domain: 'growth', needs: ['hasScreen'], neglectRisk: 10,
};

describe('foundTime — the window itself', () => {
  it('offers nothing longer than the time they have', () => {
    const r = foundTime({ minutes: 30, where: setting('free'), candidates: [deepBlock, learn] });
    expect(r.primary?.key).toBe('growth.daily');
  });

  it('treats a few spare minutes as too short to plan around', () => {
    const r = foundTime({ minutes: 5, where: setting('free'), candidates: [walk, callHome] });
    expect(r.primary).toBeNull();
    expect(r.restNote).toMatch(/Too short/);
  });

  it('prefers the longer thing when the window is generous', () => {
    const r = foundTime({ minutes: 120, where: setting('free'), candidates: [learn, deepBlock] });
    // Same owed and lower risk, but a found two hours is the rare chance
    // to do the thing an ordinary evening cannot hold.
    expect(r.primary?.key).toBe('career.deep');
  });

  it('offers one thing and no more than two alternates', () => {
    const r = foundTime({
      minutes: 120, where: setting('free'), candidates: [walk, callHome, deepBlock, learn],
    });
    expect(r.primary).not.toBeNull();
    expect(r.alternates.length).toBeLessThanOrEqual(2);
  });
});

describe('foundTime — where you are decides before what matters', () => {
  it('does not offer a call home from an open-plan desk', () => {
    // The case itself: a two-hour meeting dies, and you are still at a desk.
    const r = foundTime({ minutes: 120, where: setting('desk'), candidates: [callHome, deepBlock] });
    expect(r.primary?.key).toBe('career.deep');
    expect([r.primary, ...r.alternates].map((c) => c?.key)).not.toContain('family.call');
  });

  it('says which domain the place ruled out, rather than quietly demoting it', () => {
    const r = foundTime({ minutes: 120, where: setting('desk'), candidates: [callHome, deepBlock] });
    expect(r.ruledOut?.domain).toBe('family');
    expect(r.ruledOut?.limits).toContain('nothing that needs a private call');
  });

  it('keeps quiet when the place cost them nothing', () => {
    const r = foundTime({ minutes: 120, where: setting('free'), candidates: [callHome, deepBlock] });
    expect(r.ruledOut).toBeNull();
  });

  it('does not apologise when the ruled-out thing would not have won anyway', () => {
    const r = foundTime({
      minutes: 60,
      where: setting('desk'),
      candidates: [
        { ...deepBlock, neglectRisk: 95, minutes: 45 },
        { ...callHome, neglectRisk: 5 },
      ],
    });
    expect(r.primary?.key).toBe('career.deep');
    expect(r.ruledOut).toBeNull();
  });

  it('says so plainly when the place fits nothing at all', () => {
    const r = foundTime({ minutes: 60, where: setting('desk'), candidates: [walk, callHome] });
    expect(r.primary).toBeNull();
    expect(r.restNote).toMatch(/fits where you are/);
    expect(r.ruledOut?.domain).toBeTruthy();
  });

  it('an unstated setting rules nothing out', () => {
    const r = foundTime({ minutes: 60, where: setting(), candidates: [walk, callHome] });
    expect(r.primary).not.toBeNull();
    expect(r.ruledOut).toBeNull();
  });
});

describe('foundTime — a commitment already made leads', () => {
  it('puts a rhythm the week still owes above a starved domain', () => {
    const owedWalk = { ...walk, owedThisWeek: 2, neglectRisk: 10 };
    const r = foundTime({
      minutes: 60, where: setting('free'), candidates: [callHome, owedWalk],
    });
    expect(r.primary?.key).toBe('health.move');
  });

  it('prefers the one that owes more', () => {
    const r = foundTime({
      minutes: 60,
      where: setting('free'),
      candidates: [{ ...callHome, owedThisWeek: 1 }, { ...walk, owedThisWeek: 3 }],
    });
    expect(r.primary?.key).toBe('health.move');
  });

  it('falls back to the starved domain when nothing is owed', () => {
    const r = foundTime({ minutes: 60, where: setting('free'), candidates: [walk, callHome] });
    expect(r.primary?.key).toBe('family.call'); // risk 90 beats 50
  });
});

describe('foundTime — an hour is allowed to be nothing', () => {
  it('says resting is a real answer when nothing is asking', () => {
    const r = foundTime({ minutes: 60, where: setting('free'), candidates: [] });
    expect(r.primary).toBeNull();
    expect(r.restNote).toMatch(/real answer/);
  });

  it('never scolds, whatever the answer', () => {
    for (const r of [
      foundTime({ minutes: 60, where: setting('free'), candidates: [] }),
      foundTime({ minutes: 5, where: setting('desk'), candidates: [walk] }),
      foundTime({ minutes: 60, where: setting('desk'), candidates: [walk, callHome] }),
    ]) {
      expect(r.restNote ?? '').not.toMatch(FORBIDDEN);
    }
  });

  it('is deterministic — the same window twice gives the same answer', () => {
    const args = { minutes: 60, where: setting('free'), candidates: [walk, callHome, learn] };
    expect(foundTime(args).primary?.key).toBe(foundTime(args).primary?.key);
  });
});
