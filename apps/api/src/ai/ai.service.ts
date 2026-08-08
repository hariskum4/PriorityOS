import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserClock } from '../common/clock.module';
import { PromptTemplate } from '@priority/ai-prompts';
import { buildPseudonyms, redact, restore } from './redaction';

const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

/**
 * LLM client for any OpenAI-compatible chat-completions endpoint.
 * Configured for OpenRouter by default (AI_BASE_URL=https://openrouter.ai/api/v1),
 * but works unchanged with OpenAI, Together, Groq, a local Ollama, etc.
 *
 * Hard rules:
 *  - Deterministic fallbacks: if AI_ENABLED=false, no API key, or the call
 *    fails, every caller receives usable structured copy. The app never
 *    breaks because a model is down (important on free tiers, which are flaky).
 *  - Strict JSON contracts, described in each PromptTemplate's system prompt,
 *    enforced here by defensive parsing (free models don't reliably support
 *    response_format, so we lean on the prompt + a tolerant parser instead).
 *  - Every generation is persisted to ai_recommendations for observability.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private prisma: PrismaService,
    private clock: UserClock,
  ) {}

  get enabled(): boolean {
    return process.env.AI_ENABLED !== 'false' && !!process.env.AI_API_KEY;
  }

  /**
   * The cached answer if there is one, otherwise the fallback — now — and the
   * generation runs behind the response.
   *
   * For surfaces a person is waiting on. `generate` blocks until the model
   * answers, which is 1.8s from a laptop and was measured at 9.6s from the
   * production instance; with the dashboard's own queries either side of it
   * that put the Today screen at 18.5s against a client that gives up at 15.
   * A card that arrives late is worse than a card written by the engine, and
   * the engine's version is written to be worth reading on its own.
   *
   * The cost is one load of latency: the first visit of the day shows the
   * deterministic copy and the model's version is there on the next. That is
   * the right trade for a screen somebody opens every morning.
   */
  async generateOrDefer<T>(
    userId: string,
    kind: string,
    template: PromptTemplate,
    context: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
    fallback: T,
    opts: { cacheKey: string; timeoutMs?: number },
  ): Promise<T> {
    const hit = await this.cachedFor<T>(userId, kind, opts.cacheKey);
    if (hit) return hit;
    /* Nothing cached. Hand back the engine's answer and let the model catch
       up for next time. Render keeps the process alive after the response, so
       the work finishes; a failure is logged and changes nothing on screen. */
    void this.generate(userId, kind, template, context, fallback, opts)
      .catch((err) => this.logger.error(`deferred ${kind} failed for ${userId}`, err as Error));
    return fallback;
  }

  async generate<T>(
    userId: string,
    kind: string,
    template: PromptTemplate,
    /**
     * The prompt's inputs — or a function that assembles them.
     *
     * A thunk exists because assembling can be expensive. The daily card's
     * context is the life digest, seven queries deep, and it was being built
     * on every dashboard load and then discarded the instant the day-cache
     * below answered: measured at 2.8 of the dashboard's 8.5 seconds, spent
     * on a value nothing read. Pass a function and it is only called when a
     * generation is actually going to happen.
     */
    context: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
    fallback: T,
    opts?: { cacheKey?: string; timeoutMs?: number },
  ): Promise<T> {
    // Day-level cache: hot paths (the dashboard) must not regenerate — or
    // even re-persist — the same narrative on every single request.
    if (opts?.cacheKey) {
      const hit = await this.cachedFor<T>(userId, kind, opts.cacheKey);
      if (hit) return hit;
    }
    if (!this.enabled) return this.persist(userId, kind, fallback, 'fallback', opts?.cacheKey);

    const model = process.env.AI_MODEL ?? DEFAULT_MODEL;
    const baseUrl = process.env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1';

    // Free pools generally reserve the right to train on what they are sent.
    // That is an acceptable trade for a demo and not for a person's marriage,
    // so production has to say the word out loud.
    if (model.endsWith(':free')
      && process.env.NODE_ENV === 'production'
      && process.env.AI_ALLOW_FREE_TIER !== 'true') {
      this.logger.warn(
        `Refusing to send personal data to the free model "${model}". `
        + 'Set AI_MODEL to a paid endpoint, or AI_ALLOW_FREE_TIER=true to accept the terms.',
      );
      return this.persist(userId, kind, fallback, 'fallback', opts?.cacheKey);
    }

    // Names are swapped for placeholders before anything is sent, and put back
    // before the copy reaches the person.
    const names = await this.prisma.relationship.findMany({
      where: { userId },
      select: { name: true },
    });
    const pseudonyms = buildPseudonyms(names.map((n) => n.name));
    /* Past the cache and past every guard — only now is the context worth
       assembling. See the note on the parameter. */
    const resolved = typeof context === 'function' ? await context() : context;
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
          // Optional OpenRouter attribution (shows up on their dashboard).
          'HTTP-Referer': process.env.AI_APP_URL ?? 'https://priority.app',
          'X-Title': 'Priority',
        },
        body: JSON.stringify({
          model,
          // Low temperature on purpose: this is grounded coaching copy over
          // real user data, not creative writing. Free-tier models hallucinate
          // (invented people, misread numbers) at higher temperatures.
          temperature: 0.4,
          messages: [
            { role: 'system', content: template.system },
            { role: 'user', content: redact(template.buildUser(resolved), pseudonyms) },
          ],
        }),
        /**
         * Free pools sometimes hang instead of failing — never stall a request.
         *
         * 25s suits a caller whose screen is waiting on the answer. It is too
         * tight for one that asks for several things at once from a model that
         * emits reasoning tokens before its JSON: `stack_craft` timed out on
         * every attempt until it could ask for longer. A caller that renders
         * something useful while this runs can afford to wait, so the budget
         * belongs to the caller rather than to this method.
         */
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 25_000),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as any;
      if (data.error) throw new Error(`LLM error: ${data.error.message ?? JSON.stringify(data.error)}`);
      const text: string = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('Empty completion');

      const parsed = parseStrictJson<T>(restore(text, pseudonyms));
      /**
       * A generation that talks about the machine is not usable copy.
       *
       * The prompt asks for this and asking is not enough — "with a
       * neglectRisk of 0, there's no urgent gap" and "given a neglect risk of
       * 20 and importance of 40" both reached the Now card, which is the first
       * thing a new account reads. A model repeating a field name has not
       * written a worse sentence, it has written a different kind of thing,
       * and the deterministic fallback is always a real sentence. So this
       * falls back rather than tries to clean it up.
       */
      if (leaksInternals(parsed)) {
        this.logger.warn(`AI generation for ${kind} named internals; using fallback`);
        return this.persist(userId, kind, fallback, 'fallback', opts?.cacheKey);
      }
      return this.persist(userId, kind, parsed, model, opts?.cacheKey);
    } catch (err) {
      this.logger.warn(`AI generation failed for ${kind}: ${String(err)}`);
      return this.persist(userId, kind, fallback, 'fallback', opts?.cacheKey);
    }
  }

  /**
   * Today's cached generation for this exact key, if there is one.
   *
   * It used to read the single newest row for the kind and then compare its
   * key, which works only while a kind has one key per day. `moment_prompts`
   * has one per moment: open moment A, then B, then A again and every read
   * missed, because the newest row was always the other moment's. The result
   * was a model call on essentially every form open, and a row written for
   * each. Matching the key inside the query finds the newest row that is
   * actually for this subject, and an older row with the same key is still
   * valid for the day it was written in.
   */
  private async cachedFor<T>(
    userId: string,
    kind: string,
    cacheKey: string,
  ): Promise<T | null> {
    const dayStart = await this.clock.startOfToday(userId);
    const cached = await this.prisma.aiRecommendation.findFirst({
      where: {
        userId,
        kind,
        createdAt: { gte: dayStart },
        content: { path: ['_cacheKey'], equals: cacheKey },
      },
      orderBy: { createdAt: 'desc' },
    });
    const content = cached?.content as Record<string, unknown> | undefined;
    if (!content) return null;
    const { _cacheKey, ...rest } = content;
    return rest as T;
  }

  private async persist<T>(
    userId: string,
    kind: string,
    content: T,
    model: string,
    cacheKey?: string,
  ) {
    await this.prisma.aiRecommendation.create({
      data: {
        userId,
        kind,
        content: { ...(content as object), ...(cacheKey ? { _cacheKey: cacheKey } : {}) },
        model,
      },
    });
    return content;
  }
}

/**
 * Field names and internal metrics, as they escape into prose.
 *
 * Matched with a space allowed where the camelCase hump is, because that is
 * how a model renders one when it is trying to sound natural: `neglectRisk`
 * becomes "neglect risk" and reads as English until you notice it is a column.
 * Whole words only — "importance" on its own is an ordinary word and belongs
 * in this app's vocabulary; "importance score of 40" does not.
 */
const INTERNAL_TERMS = /\b(neglect\s?risk|importance\s?score|attention\s?score|priority\s?score|neglect\s?score|domain\s?type|per\s?week|life\s?domain|magnitude of|cache\s?key|user\s?id)\b/i;

/** Every string anywhere in a generation, however the shape nests. */
export function leaksInternals(value: unknown): boolean {
  if (typeof value === 'string') return INTERNAL_TERMS.test(value);
  if (Array.isArray(value)) return value.some(leaksInternals);
  if (value && typeof value === 'object') return Object.values(value).some(leaksInternals);
  return false;
}

/**
 * The prompt templates instruct the model to respond with bare JSON, which the
 * chosen models follow reliably — but strip code fences and any stray
 * preamble/sign-off text defensively before parsing (free models vary).
 */
function parseStrictJson<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonSlice =
    start !== -1 && end !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonSlice) as T;
}
