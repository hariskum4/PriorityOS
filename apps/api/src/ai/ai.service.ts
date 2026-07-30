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

  async generate<T>(
    userId: string,
    kind: string,
    template: PromptTemplate,
    context: Record<string, unknown>,
    fallback: T,
    opts?: { cacheKey?: string; timeoutMs?: number },
  ): Promise<T> {
    // Day-level cache: hot paths (the dashboard) must not regenerate — or
    // even re-persist — the same narrative on every single request.
    if (opts?.cacheKey) {
      const dayStart = await this.clock.startOfToday(userId);
      const cached = await this.prisma.aiRecommendation.findFirst({
        where: { userId, kind, createdAt: { gte: dayStart } },
        orderBy: { createdAt: 'desc' },
      });
      const content = cached?.content as Record<string, unknown> | undefined;
      if (content && content._cacheKey === opts.cacheKey) {
        const { _cacheKey, ...rest } = content;
        return rest as T;
      }
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
            { role: 'user', content: redact(template.buildUser(context), pseudonyms) },
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
      return this.persist(userId, kind, parsed, model, opts?.cacheKey);
    } catch (err) {
      this.logger.warn(`AI generation failed for ${kind}: ${String(err)}`);
      return this.persist(userId, kind, fallback, 'fallback', opts?.cacheKey);
    }
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
