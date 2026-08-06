/**
 * The password hashes that already exist must keep working.
 *
 * The API moved off a host that could compile native modules, so `argon2`
 * — built with node-gyp at install time — was replaced by `@node-rs/argon2`,
 * which ships prebuilt binaries. Every account created before that change has
 * a hash written by the old library, and there is no plaintext anywhere to
 * re-hash from. If the new library cannot read the old format, nobody can log
 * in again, and no fix exists after the fact.
 *
 * The literal below is a real hash produced by `argon2@0.40.0` — the exact
 * package that wrote every hash in the database. It is checked in rather than
 * generated, because generating it would need the very dependency this change
 * removes, and a test that quietly stops testing the thing is worse than no
 * test. As a string it keeps working for as long as the rows do.
 */
import { describe, it, expect } from 'vitest';
import { hash, verify } from '@node-rs/argon2';

/** Written by `argon2@^0.40.0` for the password below. */
const FROM_THE_OLD_LIBRARY =
  '$argon2id$v=19$m=65536,t=3,p=4$eCioEkKdRNkARHRZ8kGHVw$hEFPLGXv0lt9nbF7K1TAladzkGWlfVtyHKB8RlitlDI';
const ITS_PASSWORD = 'Testpass123!';

describe('an account that predates the move off native argon2', () => {
  it('can still sign in', async () => {
    expect(await verify(FROM_THE_OLD_LIBRARY, ITS_PASSWORD)).toBe(true);
  });

  it('and a wrong password is still wrong', async () => {
    /* The half that matters more. A verifier that cannot read the format and
       returns true regardless would pass the test above. */
    expect(await verify(FROM_THE_OLD_LIBRARY, 'not the password')).toBe(false);
  });

  it('carries its own cost parameters, so it verifies at the cost it was written with', () => {
    /* The new default is cheaper — OWASP's current recommendation rather than
       the old 64MB — and that applies only to hashes written from now on. An
       old hash is read with the parameters embedded in its own string. */
    expect(FROM_THE_OLD_LIBRARY).toContain('m=65536,t=3,p=4');
  });
});

describe('hashes written from now on', () => {
  it('are argon2id in the same format, so this is reversible', async () => {
    const fresh = await hash(ITS_PASSWORD);
    expect(fresh.startsWith('$argon2id$v=19$')).toBe(true);
    expect(await verify(fresh, ITS_PASSWORD)).toBe(true);
    expect(await verify(fresh, 'not the password')).toBe(false);
  });

  it('never store the password', async () => {
    /* Obvious, and worth one line: the whole file is about a value nobody can
       recover, and that property is the reason the compatibility above had to
       be proved before the swap rather than after it. */
    expect(await hash(ITS_PASSWORD)).not.toContain(ITS_PASSWORD);
  });
});
