import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PromptTemplate } from '@priority/ai-prompts';

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

  constructor(private prisma: PrismaService) {}

  get enabled(): boolean {
    return process.env.AI_ENABLED !== 'false' && !!process.env.AI_API_KEY;
  }

  async generate<T>(
    userId: string,
    kind: string,
    template: PromptTemplate,
    context: Record<string, unknown>,
    fallback: T,
    opts?: { cacheKey?: string },
  ): Promise<T> {
    // Day-level cache: hot paths (the dashboard) must not regenerate — or
    // even re-persist — the same narrative on every single request.
    if (opts?.cacheKey) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
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
            { role: 'user', content: template.buildUser(context) },
          ],
        }),
        // Free pools sometimes hang instead of failing — never stall a request.
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as any;
      if (data.error) throw new Error(`LLM error: ${data.error.message ?? JSON.stringify(data.error)}`);
      const text: string = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('Empty completion');

      const parsed = parseStrictJson<T>(text);
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
