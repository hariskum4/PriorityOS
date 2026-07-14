import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PromptTemplate } from '@priority/ai-prompts';

/**
 * Provider-agnostic LLM client (OpenAI-compatible chat completions).
 * Hard rules:
 *  - Deterministic fallbacks: if AI_ENABLED=false or the call fails,
 *    every caller receives usable structured copy. The app never breaks
 *    because a model is down.
 *  - Strict JSON contracts, validated by the caller.
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
    try {
      const res = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL ?? 'gpt-4o-mini',
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: template.system },
            { role: 'user', content: template.buildUser(context) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}`);
      const data = (await res.json()) as any;
      const text: string = data.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as T;
      return this.persist(userId, kind, parsed, process.env.AI_MODEL ?? 'unknown', opts?.cacheKey);
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
