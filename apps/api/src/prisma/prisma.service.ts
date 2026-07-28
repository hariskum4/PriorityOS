import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { encryptField, decryptField, isEncrypted } from '../common/crypto';

/**
 * The columns that never reach the database in the clear.
 *
 * Chosen by what would be worst to read about a stranger rather than by what
 * is technically sensitive: the sentence someone wrote about what they
 * avoided, what they were grateful for, what they want to remember about a
 * person. Titles and dates stay readable so rows can still be queried and
 * ordered — encrypting a column means giving up searching it, a real cost
 * worth paying only where the text is genuinely private.
 */
const ENCRYPTED: Record<string, string[]> = {
  JournalEntry: ['gratitude', 'whatMattered', 'whatIAvoided', 'gladNotPostponed', 'freeText'],
  Memory: ['reflection'],
  Relationship: ['notes'],
};

const WRITES = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany']);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    /**
     * Applied here rather than in each service, on purpose.
     *
     * Journal rows alone are read and written from eight different files. Any
     * scheme that asks each call site to remember to decrypt will eventually
     * miss one, and the failure mode is showing someone base64 where their own
     * words should be. One hook covers every path that exists and every path
     * anyone adds later.
     */
    this.$use(async (params, next) => {
      const fields = params.model ? ENCRYPTED[params.model] : undefined;
      if (!fields) return next(params);

      if (WRITES.has(params.action)) {
        encryptIn(params.args?.data, fields);
        encryptIn(params.args?.create, fields);
        encryptIn(params.args?.update, fields);
      }

      return decryptOut(await next(params), fields);
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** Encrypt in place — handles a single row and the createMany array form. */
function encryptIn(data: unknown, fields: string[]) {
  if (!data || typeof data !== 'object') return;

  if (Array.isArray(data)) {
    for (const row of data) encryptIn(row, fields);
    return;
  }

  const row = data as Record<string, unknown>;
  for (const field of fields) {
    const value = row[field];
    if (typeof value === 'string' && value !== '') {
      row[field] = encryptField(value);
    } else if (value && typeof value === 'object' && 'set' in (value as object)) {
      // Prisma's { set: value } update form.
      const wrapper = value as { set?: unknown };
      if (typeof wrapper.set === 'string' && wrapper.set !== '') {
        wrapper.set = encryptField(wrapper.set);
      }
    }
  }
}

/** Decrypt whatever comes back — one row, a list, or something else entirely. */
function decryptOut<T>(result: T, fields: string[]): T {
  if (!result || typeof result !== 'object') return result;

  if (Array.isArray(result)) {
    for (const row of result) decryptOut(row, fields);
    return result;
  }

  const row = result as Record<string, unknown>;
  for (const field of fields) {
    if (isEncrypted(row[field])) row[field] = decryptField(row[field] as string);
  }
  return result;
}
