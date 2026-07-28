/**
 * Encryption for the columns that would hurt most to lose.
 *
 * A journal entry is not a row of analytics. It is the sentence someone wrote
 * about the thing they are ashamed of, or afraid of, or has not told anyone
 * else. Database-level encryption protects the disk; it does nothing about a
 * leaked backup, a mis-scoped read replica, or an engineer with production
 * access and a bad afternoon. So the most sensitive free text is encrypted by
 * the application, and the database stores something no one can read without
 * the key.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails loudly instead of
 * decrypting to something plausible. A fresh 96-bit IV per value, because
 * reusing an IV with GCM is catastrophic rather than merely weak.
 *
 * The stored form is deliberately self-describing:
 *
 *     enc:v1:<iv>:<tag>:<ciphertext>      (all base64)
 *
 * Anything without that prefix is treated as plaintext and returned as-is,
 * which is what lets rows written before this existed keep working. New writes
 * are always encrypted; old rows are upgraded whenever they are next written.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { isProduction } from './env';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

let cachedKey: Buffer | null | undefined;
let warned = false;

/**
 * Missing key: production refuses, development passes through loudly.
 *
 * The one thing it must never do is quietly write plaintext in production,
 * which is the same silent-downgrade failure as an unset JWT secret.
 */
function key(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (isProduction) {
      throw new Error(
        'DATA_ENCRYPTION_KEY is not set. Refusing to start: journals and '
        + 'memories would be written to the database in plain text.',
      );
    }
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn('[crypto] DATA_ENCRYPTION_KEY unset — sensitive fields stored in plain text.');
    }
    cachedKey = null;
    return cachedKey;
  }

  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `DATA_ENCRYPTION_KEY must be 32 bytes base64-encoded (got ${buf.length}). `
      + 'Generate one with: openssl rand -base64 32',
    );
  }
  cachedKey = buf;
  return cachedKey;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField(value: string): string {
  const k = key();
  if (!k || value === '') return value;
  if (isEncrypted(value)) return value;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, k, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX
    + `${iv.toString('base64')}:${tag.toString('base64')}:${body.toString('base64')}`;
}

export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value;

  const k = key();
  if (!k) {
    // Encrypted data with no key is not readable, and pretending otherwise
    // would put ciphertext on someone's screen as if it were their journal.
    throw new Error('Encrypted value found but DATA_ENCRYPTION_KEY is not set.');
  }

  const [ivB64, tagB64, bodyB64] = value.slice(PREFIX.length).split(':');
  const decipher = createDecipheriv(ALGO, k, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Test seam: the key is cached, so a test changing the env has to say so. */
export function resetKeyCache() {
  cachedKey = undefined;
  warned = false;
}
