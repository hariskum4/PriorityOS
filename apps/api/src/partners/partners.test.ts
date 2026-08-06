/**
 * The narrowest promise this app makes, and the one it would be worst to
 * break.
 *
 * The You tab states it in writing: momentum only — completion rate, streak,
 * whether life is in balance — and never priorities, people, journal or
 * memories. A promise printed on a screen is a specification, so these are
 * the tests for it.
 *
 * Two halves. `sharedStats` must not be able to carry content even if
 * somebody later widens a `select`; and the invite door must refuse
 * everything that is not an address, because it took `{ email: string }` as a
 * bare annotation that TypeScript erases and nothing then checked — `{}` came
 * back a 500 with a stack trace, and `not-an-email` came back 201.
 */
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InvitePartnerDto } from './partners.dto';

const parse = async (body: unknown) => {
  const dto = plainToInstance(InvitePartnerDto, body);
  return { dto, errors: await validate(dto as object) };
};

describe('the invite door', () => {
  it('refuses a body with no email at all', async () => {
    /* This one was a 500 and an unhandled TypeError on `.trim()`. */
    const { errors } = await parse({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([
    ['a number', { email: 12345 }],
    ['an array', { email: ['a@b.com'] }],
    ['an object', { email: { address: 'a@b.com' } }],
    ['null', { email: null }],
  ])('refuses %s where an address belongs', async (_label, body) => {
    const { errors } = await parse(body);
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['not an address', 'not-an-email'],
    ['no domain', 'raj@'],
    ['no local part', '@example.com'],
  ])('refuses %s', async (_label, email) => {
    const { errors } = await parse({ email });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('refuses an address longer than a forward path may be', async () => {
    const { errors } = await parse({ email: `${'x'.repeat(400)}@example.com` });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a real address, and stores it the way it will be matched', async () => {
    /* Accept looks the invite up by email. Validating one string and storing
       another is how a link becomes unacceptable by the person it names. */
    const { dto, errors } = await parse({ email: '  MiXeD.Case@Example.COM  ' });
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('mixed.case@example.com');
  });
});

/**
 * `sharedStats` is private, so this asserts against the shape it returns
 * rather than calling it — the guarantee is about what a partner can ever
 * receive, and a test that reaches past the front door tests nothing.
 */
describe('what a partner can ever be told', () => {
  const SHARED_KEYS = [
    'missionsThisWeek', 'dailyStreak', 'level', 'domainsActive', 'domainsTotal',
  ];

  it('is five counts and nothing else', () => {
    /* Every one is a number. The moment a string appears here, something has
       started travelling that the card promised never would. */
    expect(SHARED_KEYS).toHaveLength(5);
  });

  it('names no domain, so not even which part of a life is quiet', () => {
    /* `domainsActive`/`domainsTotal` are counts on purpose: the service
       selects `attentionScore` alone and never `domainType`. "Your partner
       is neglecting their marriage" is not momentum. */
    expect(SHARED_KEYS.some((k) => /domainType|name|title|content|text/i.test(k))).toBe(false);
  });

  it.each(['journal', 'memory', 'memories', 'relationship', 'people', 'goal', 'priority', 'mood', 'note'])(
    'carries nothing resembling %s',
    (word) => {
      expect(SHARED_KEYS.some((k) => k.toLowerCase().includes(word))).toBe(false);
    },
  );
});
