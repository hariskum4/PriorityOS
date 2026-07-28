/**
 * Encryption is the one thing here that fails silently in both directions:
 * write it wrong and the data is readable by anyone; read it wrong and
 * someone's journal comes back as base64. Both deserve tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptField, decryptField, isEncrypted, resetKeyCache } from './crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = KEY;
  resetKeyCache();
});

afterEach(() => {
  delete process.env.DATA_ENCRYPTION_KEY;
  resetKeyCache();
});

describe('encryptField', () => {
  it('round-trips exactly, including newlines and unicode', () => {
    const text = 'Called Amma.\nShe sounded tired — मैंने कुछ नहीं कहा. 🙏';
    expect(decryptField(encryptField(text))).toBe(text);
  });

  it('leaves no trace of the plaintext', () => {
    const out = encryptField('I have not told anyone about this');
    expect(out).not.toContain('anyone');
    expect(out.startsWith('enc:v1:')).toBe(true);
  });

  it('never produces the same ciphertext twice', () => {
    // A fixed IV would leak that two entries say the same thing.
    const a = encryptField('the same sentence');
    const b = encryptField('the same sentence');
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it('does not double-encrypt a value that is already encrypted', () => {
    const once = encryptField('hello');
    expect(encryptField(once)).toBe(once);
  });

  it('leaves empty strings alone', () => {
    expect(encryptField('')).toBe('');
  });
});

describe('decryptField', () => {
  it('passes plaintext through, so rows written before this existed still read', () => {
    expect(decryptField('an old unencrypted note')).toBe('an old unencrypted note');
  });

  it('refuses a tampered ciphertext instead of returning something plausible', () => {
    const good = encryptField('transfer approved');
    const parts = good.slice('enc:v1:'.length).split(':');
    const body = Buffer.from(parts[2], 'base64');
    body[0] ^= 0xff;
    const tampered = `enc:v1:${parts[0]}:${parts[1]}:${body.toString('base64')}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  it('cannot be read with a different key', () => {
    const sealed = encryptField('private');
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    resetKeyCache();
    expect(() => decryptField(sealed)).toThrow();
  });

  it('rejects a key of the wrong length rather than quietly weakening', () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    resetKeyCache();
    expect(() => encryptField('x')).toThrow(/32 bytes/);
  });

  it('refuses to hand back ciphertext when the key has gone missing', () => {
    const sealed = encryptField('private');
    delete process.env.DATA_ENCRYPTION_KEY;
    resetKeyCache();
    expect(() => decryptField(sealed)).toThrow(/not set/);
  });
});

describe('without a key configured', () => {
  it('stores plaintext in development rather than blocking local work', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    resetKeyCache();
    expect(encryptField('local note')).toBe('local note');
    expect(isEncrypted('local note')).toBe(false);
  });
});
