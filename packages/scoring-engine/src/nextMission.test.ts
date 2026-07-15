import { describe, it, expect } from 'vitest';
import { suggestNextMission, NextMissionContext } from './nextMission';

const base: NextMissionContext = {
  domains: [
    { domainType: 'family', importance: 90, attention: 40, neglectRisk: 55 },
    { domainType: 'health', importance: 70, attention: 60, neglectRisk: 20 },
    { domainType: 'purpose', importance: 60, attention: 10, neglectRisk: 45 },
  ],
  relationships: [
    { id: 'r1', name: 'Amma', relationType: 'mother', daysSinceContact: 12, desiredCadenceDays: 7 },
  ],
  goalsWithoutSteps: [{ id: 'g1', title: 'Write the book', domainType: 'purpose' }],
  lastCompletedDomain: null,
  pendingDomains: [],
};

describe('the adaptive next-mission loop', () => {
  it('an overdue person beats everything (relationships are the point)', () => {
    const s = suggestNextMission(base)!;
    expect(s.missionType).toBe('relationship');
    expect(s.title).toContain('Amma');
    expect(s.title).toContain('12 days');
    expect(s.relationshipId).toBe('r1');
    expect(s.domainType).toBe('family');
    expect(s.rationale).toMatch(/every ~7 days/);
  });

  it('a never-contacted person counts as overdue, framed warmly', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [{ id: 'r2', name: 'Appa', relationType: 'father', daysSinceContact: null, desiredCadenceDays: 7 }],
    })!;
    expect(s.title).toMatch(/first hello/);
  });

  it('with no one overdue, the hardest-drifting domain wins', () => {
    const s = suggestNextMission({ ...base, relationships: [] })!;
    expect(s.domainType).toBe('family'); // risk 55
    expect(s.rationale).toMatch(/drifting/);
    expect(s.estimatedMinutes).toBeLessThanOrEqual(60);
  });

  it('variety guard: never the same domain twice in a row…', () => {
    const s = suggestNextMission({ ...base, relationships: [], lastCompletedDomain: 'family' })!;
    expect(s.domainType).not.toBe('family'); // purpose (45) takes it
    expect(s.domainType).toBe('purpose');
  });

  it('…unless that domain is at serious risk', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      lastCompletedDomain: 'family',
      domains: base.domains.map((d) =>
        d.domainType === 'family' ? { ...d, neglectRisk: 75 } : d,
      ),
    })!;
    expect(s.domainType).toBe('family'); // serious risk overrides variety
  });

  it('never nags about a person who already has a pending mission', () => {
    const s = suggestNextMission({ ...base, pendingRelationshipIds: ['r1'] })!;
    expect(s.missionType).not.toBe('relationship'); // Amma covered → domain next
    expect(s.domainType).toBe('family');
  });

  it('does not double up on domains already covered by pending missions', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      pendingDomains: ['family', 'purpose'],
    })!;
    // family + purpose covered, health not drifting → goal step
    expect(s.title).toBe('First step: Write the book');
  });

  it('a stalled goal becomes the step when nothing is drifting', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      domains: base.domains.map((d) => ({ ...d, neglectRisk: 10 })),
    })!;
    expect(s.title).toBe('First step: Write the book');
    expect(s.rationale).toMatch(/wish/);
  });

  it('falls back to the widest say-do gap with a concrete action', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      goalsWithoutSteps: [],
      domains: base.domains.map((d) => ({ ...d, neglectRisk: 10 })),
    })!;
    expect(s.domainType).toBe('family'); // gap 50
    expect(s.title.length).toBeGreaterThan(10);
    expect(s.rationale).toMatch(/90 importance/);
  });

  it('never suggests a title that is already pending (duplicate guard)', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      pendingTitles: ['Call someone in your family — ten minutes counts'],
    })!;
    // the domain still deserves attention — but never the identical mission
    expect(s.title).not.toBe('Call someone in your family — ten minutes counts');
  });

  it('title dedup is case-insensitive', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      pendingTitles: ['call someone in your family — TEN minutes counts'],
    })!;
    expect(s.title.toLowerCase()).not.toBe('call someone in your family — ten minutes counts');
  });

  it('rotates action variants instead of repeating last week\'s', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      recentTitles: ['Call someone in your family — ten minutes counts'],
    })!;
    expect(s.domainType).toBe('family'); // still the right domain…
    expect(s.title).not.toBe('Call someone in your family — ten minutes counts'); // …different action
  });

  it('a dismissed action is retired; the domain offers another', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      dismissedTitles: ['Call someone in your family — ten minutes counts'],
    })!;
    expect(s.domainType).toBe('family');
    expect(s.title).not.toBe('Call someone in your family — ten minutes counts');
  });

  it('dismissing every variant yields the whole domain — no nagging', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      dismissedTitles: [
        'Call someone in your family — ten minutes counts',
        'Send a photo that will make your family smile',
        'Ask a parent one question about their younger years',
        'Plan the next visit — put a date on it',
      ],
    })!;
    expect(s.domainType).toBe('purpose'); // family fully declined → next drifting domain
  });

  it('a dismissed goal step stops being re-suggested', () => {
    const s = suggestNextMission({
      ...base,
      relationships: [],
      domains: base.domains.map((d) => ({ ...d, neglectRisk: 10 })),
      dismissedTitles: ['First step: Write the book'],
    })!;
    expect(s.title).not.toBe('First step: Write the book'); // falls through to gap branch
  });

  it('a genuinely aligned life gets silence, not filler', () => {
    const s = suggestNextMission({
      domains: [{ domainType: 'family', importance: 80, attention: 78, neglectRisk: 5 }],
      relationships: [],
      goalsWithoutSteps: [],
      pendingDomains: [],
    });
    expect(s).toBeNull();
  });

  it('never uses guilt or doom vocabulary', () => {
    const forbidden = /death|dying|failed|failure|guilt|shame|neglecting your/i;
    for (const variant of [base, { ...base, relationships: [] }]) {
      const s = suggestNextMission(variant as NextMissionContext);
      if (s) expect(`${s.title} ${s.rationale}`).not.toMatch(forbidden);
    }
  });
});
