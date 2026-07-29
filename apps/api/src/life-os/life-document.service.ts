/**
 * The Life Document.
 *
 * A readable record of everything PriorityOS knows about a person and every
 * connection it has drawn — rendered as markdown, on demand, from Postgres.
 *
 * **It is deliberately not a stored file.** Every fact in here already lives in
 * a table. Persisting a parallel `.md` would create a second source of truth
 * that drifts the moment anything writes to one and not the other, cannot be
 * safely edited from two devices, and would have to be parsed back to be useful
 * to the engines. Generating it instead gives every benefit people actually want
 * from a file — readable, portable, greppable, exportable, diffable — with no
 * consistency problem at all.
 *
 * Two of the product's ethics rules are satisfied here and nowhere else:
 * "all memory inspectable and editable" and "allow full data export". A person
 * can read exactly what the system believes about their life, in prose, and
 * disagree with it.
 *
 * The tone is a record, not a report card. No scores presented as grades, no
 * congratulation, no scolding — the same rule the engines follow.
 */
import { Injectable } from '@nestjs/common';
import { LifeDomain, DOMAIN_TO_LIFE, DomainType } from '@priority/types';
import { PrismaService } from '../prisma/prisma.service';
import { LifeOsService } from './life-os.service';

const DAY_MS = 86_400_000;

function toNumber(v: unknown): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v.toString());
}

/** "13 days ago", "a month ago" — the register a person would use. */
function ago(from: Date, now: Date): string {
  const days = Math.floor((now.getTime() - from.getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return months === 1 ? 'a month ago' : `${months} months ago`;
  return `${Math.round(months / 12)} years ago`;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class LifeDocumentService {
  constructor(
    private prisma: PrismaService,
    private lifeOs: LifeOsService,
  ) {}

  /**
   * Render the whole document.
   *
   * Structured so the most human parts come first: who is in this life, then
   * what it is aimed at, then what the system has inferred. Numbers appear last
   * and always with their meaning attached — a bare "attention: 18" in a
   * document about someone's life is worse than useless.
   */
  async render(userId: string, now = new Date()): Promise<string> {
    const [
      user, domains, relationships, goals, decisions, knowledge,
      memories, journal, samples, state, graph,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.relationship.findMany({
        where: { userId },
        include: { contactLogs: { orderBy: { occurredAt: 'desc' }, take: 3 } },
        orderBy: { priorityScore: 'desc' },
      }),
      this.prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.decision.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.knowledgeItem.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.memory.findMany({
        where: { userId }, orderBy: { occurredAt: 'desc' }, take: 25,
      }),
      this.prisma.journalEntry.findMany({
        where: { userId }, orderBy: { createdAt: 'desc' }, take: 10,
      }),
      this.prisma.domainAttentionSample.findMany({
        where: { userId }, orderBy: { weekOf: 'asc' },
      }),
      this.prisma.lifeOsState.findUnique({ where: { userId } }),
      this.lifeOs.graphFor(userId),
    ]);

    const out: string[] = [];
    const age = user.dob
      ? Math.floor((now.getTime() - user.dob.getTime()) / (365.25 * DAY_MS))
      : null;

    // ---- header ---------------------------------------------------------
    out.push(`# ${user.fullName}`);
    out.push('');
    out.push(
      `*A record of what PriorityOS knows, generated ${iso(now)}. `
      + `Nothing here is stored as a document — it is read from your data each time you open it, `
      + `so it cannot drift out of date. Everything in it is yours to correct.*`,
    );
    out.push('');
    const facts = [
      age != null ? `${age} years old` : null,
      user.city ? `in ${user.city}` : null,
      user.profession ?? null,
      user.workHoursPerWeek != null ? `works ~${user.workHoursPerWeek}h/week` : null,
      user.childrenCount ? `${user.childrenCount} child${user.childrenCount > 1 ? 'ren' : ''}` : null,
    ].filter(Boolean);
    if (facts.length) out.push(facts.join(' · '));
    out.push('');
    out.push(`Using PriorityOS since ${iso(user.createdAt)} — ${ago(user.createdAt, now)}.`);
    out.push('');

    // ---- people ---------------------------------------------------------
    out.push('---');
    out.push('');
    out.push('## The people');
    out.push('');
    if (!relationships.length) {
      out.push('_No one recorded yet._');
    } else {
      for (const r of relationships) {
        const last = r.contactLogs[0]?.occurredAt ?? r.lastContactAt;
        out.push(`### ${r.name} — ${r.relationType}`);
        const bits = [
          r.city ? `lives in ${r.city}` : null,
          r.closenessScore != null ? `closeness ${r.closenessScore}/10` : null,
          r.desiredCallFrequency ? `you want to talk ${r.desiredCallFrequency}` : null,
          last ? `last spoke ${ago(last, now)}` : 'no contact logged',
        ].filter(Boolean);
        out.push(bits.join(' · '));
        if (r.healthStatus) {
          // Their words, never our inference.
          out.push('');
          out.push(`Health, as you described it: ${r.healthStatus}.`);
        }
        if (r.notes) {
          out.push('');
          out.push(`> ${r.notes}`);
        }
        if (r.contactLogs.length) {
          out.push('');
          out.push('Recent contact:');
          /**
           * One line per actual contact.
           *
           * Completing the same mission on two days writes two logs with the
           * same note, and a recurring mission does it weekly — so the raw
           * list read as "you called Amma" three times over for one call. The
           * day and the note together are what a person would call the same
           * event; the rest is bookkeeping.
           */
          const seen = new Set<string>();
          for (const c of r.contactLogs) {
            const line = `- ${iso(c.occurredAt)} — ${c.kind}${c.note ? `: ${c.note}` : ''}`;
            if (seen.has(line)) continue;
            seen.add(line);
            out.push(line);
          }
        }
        out.push('');
      }
    }

    // ---- what it's aimed at --------------------------------------------
    out.push('---');
    out.push('');
    out.push('## What you are aiming at');
    out.push('');
    const active = goals.filter((g) => g.status === 'active');
    const closed = goals.filter((g) => g.status !== 'active');
    if (!active.length) {
      out.push('_No active goals._');
    } else {
      for (const g of active) {
        out.push(`### ${g.title}`);
        out.push(
          [
            g.domainType,
            g.horizon === '5y' ? 'five-year' : 'this year',
            g.targetDate ? `target ${iso(g.targetDate)}` : 'no date set',
            `added ${ago(g.createdAt, now)}`,
          ].join(' · '),
        );
        if (g.description) {
          out.push('');
          out.push(`Why it matters, in your words:`);
          out.push('');
          out.push(`> ${g.description.replace(/\n+/g, '\n> ')}`);
        }
        out.push('');
      }
    }
    if (closed.length) {
      out.push('**Let go or achieved:** '
        + closed.map((g) => `${g.title} (${g.status})`).join(' · '));
      out.push('');
      out.push('_Releasing a goal is recorded here without comment. Priorities are allowed to change._');
      out.push('');
    }

    // ---- decisions ------------------------------------------------------
    if (decisions.length) {
      out.push('---');
      out.push('');
      out.push('## Decisions');
      out.push('');
      for (const d of decisions) {
        const options = ((d.options as any[]) ?? []).map((o) => o.label).filter(Boolean);
        out.push(`### ${d.question}`);
        out.push(
          [
            d.status,
            `judged over ${d.horizonYears} years`,
            `raised ${ago(d.createdAt, now)}`,
            d.decidedAt ? `decided ${iso(d.decidedAt)}` : null,
          ].filter(Boolean).join(' · '),
        );
        if (options.length) {
          out.push('');
          out.push(`Options weighed: ${options.join(' · ')}`);
        }
        if (d.chosenOptionId) {
          const chosen = ((d.options as any[]) ?? [])
            .find((o) => o.id === d.chosenOptionId);
          out.push('');
          out.push(`You chose: **${chosen?.label ?? d.chosenOptionId}**`);
        }
        out.push('');
      }
    }

    // ---- memories -------------------------------------------------------
    if (memories.length) {
      out.push('---');
      out.push('');
      out.push('## Moments you kept');
      out.push('');
      for (const mem of memories) {
        out.push(`- **${iso(mem.occurredAt)}** — ${mem.title}`
          + (mem.reflection ? ` — _${mem.reflection}_` : ''));
      }
      out.push('');
    }

    // ---- knowledge ------------------------------------------------------
    if (knowledge.length) {
      out.push('---');
      out.push('');
      out.push('## What you have been taking in');
      out.push('');
      for (const k of knowledge) {
        const topics = ((k.topics as string[]) ?? []).join(', ');
        out.push(`- **${k.title}** (${k.kind}) — ${k.status}`
          + (topics ? ` · ${topics}` : '')
          + (k.progress != null ? ` · ${Math.round(toNumber(k.progress) * 100)}%` : ''));
        if (k.takeaway) out.push(`  - What it changed: _${k.takeaway}_`);
      }
      out.push('');
    }

    // ---- the connections ------------------------------------------------
    // The part that justifies calling this a life *graph* rather than a list.
    out.push('---');
    out.push('');
    out.push('## The connections');
    out.push('');
    out.push(
      'These are the influence paths the system reasons over. The sentences are '
      + 'fixed to the connection, not generated — when PriorityOS explains a '
      + 'recommendation, this is the wording it uses.',
    );
    out.push('');
    const present = graph.ofKind('domain');
    const pairs: Array<[LifeDomain, LifeDomain]> = [];
    for (const a of present) {
      for (const b of present) {
        if (a.id !== b.id) pairs.push([a.id as LifeDomain, b.id as LifeDomain]);
      }
    }
    const seen = new Set<string>();
    let drawn = 0;
    for (const [a, b] of pairs) {
      const path = graph.explain(a, b);
      if (!path || path.hops.length !== 1) continue; // direct edges only, here
      const key = `${a}->${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const hop = path.hops[0];
      const arrow = hop.weight >= 0 ? 'lifts' : 'costs';
      out.push(`- **${a}** ${arrow} **${b}** (${hop.weight > 0 ? '+' : ''}${hop.weight}) — ${hop.rationale}`);
      drawn += 1;
    }
    if (!drawn) out.push('_Not enough of your life is mapped yet for connections to be drawn._');
    out.push('');

    const risks = graph.loadBearingRisks();
    if (risks.length) {
      out.push('### Load-bearing right now');
      out.push('');
      out.push('Parts of your life that are running low *and* that other parts depend on. '
        + 'Effort here moves more than one thing at once.');
      out.push('');
      for (const r of risks) {
        out.push(`- **${r.node.id}** — at ${r.node.state}, with ${r.dependents} other `
          + `${r.dependents === 1 ? 'part' : 'parts'} of your life leaning on it`);
      }
      out.push('');
    }

    // ---- the numbers, last, with their meaning -------------------------
    out.push('---');
    out.push('');
    out.push('## The numbers');
    out.push('');
    out.push('_“You say” is the importance you gave a domain. “You do” is what your '
      + 'behaviour shows. The gap between them is the only score in this product '
      + 'that matters, and it is not a grade._');
    out.push('');
    out.push('| Part of life | You say | You do | Gap |');
    out.push('| --- | --: | --: | --: |');
    for (const d of [...domains].sort((a, b) => toNumber(b.importanceScore) - toNumber(a.importanceScore))) {
      const imp = Math.round(toNumber(d.importanceScore));
      const att = Math.round(toNumber(d.attentionScore));
      const gap = Math.max(0, imp - att);
      out.push(`| ${d.domainType} | ${imp} | ${att} | ${gap > 0 ? `−${gap}` : '—'} |`);
    }
    out.push('');

    // History, only when there is enough of it to mean anything.
    const weeks = new Set(samples.map((s) => s.weekOf.getTime())).size;
    out.push(`Weekly history recorded: **${weeks} week${weeks === 1 ? '' : 's'}**.`);
    if (weeks < 6) {
      out.push('');
      out.push('_Trends and regret patterns need at least six weeks. Until then the '
        + 'system stays quiet about them rather than guessing._');
    }
    out.push('');

    // ---- what it has told you ------------------------------------------
    if (journal.length) {
      out.push('---');
      out.push('');
      out.push('## Recent reflections');
      out.push('');
      for (const j of journal) {
        const parts = [
          j.whatMattered ? `**Mattered:** ${j.whatMattered}` : null,
          j.whatIAvoided ? `**Avoided:** ${j.whatIAvoided}` : null,
          j.gratitude ? `**Grateful for:** ${j.gratitude}` : null,
        ].filter(Boolean);
        if (!parts.length) continue;
        out.push(`**${iso(j.createdAt)}**`);
        out.push('');
        for (const p of parts) out.push(`- ${p}`);
        out.push('');
      }
    }

    // ---- what you asked it to stop saying ------------------------------
    const declined = (state?.declinedTopics as string[]) ?? [];
    out.push('---');
    out.push('');
    out.push('## What you have asked it to leave alone');
    out.push('');
    if (!declined.length) {
      out.push('_Nothing. You can retire any topic permanently from the card that raised it._');
    } else {
      for (const t of declined) out.push(`- **${t}** — will not be raised again`);
      out.push('');
      out.push('_These are honoured permanently. Restore any of them from settings._');
    }
    out.push('');

    out.push('---');
    out.push('');
    out.push('*Generated from your own data. No part of this document is stored — '
      + 'close it and it stops existing until you ask for it again.*');
    out.push('');

    return out.join('\n');
  }

  /** Per-section counts, for the tab header. Cheap enough to call on render. */
  async summary(userId: string) {
    const [people, goals, decisions, knowledge, memories, weeks] = await Promise.all([
      this.prisma.relationship.count({ where: { userId } }),
      this.prisma.goal.count({ where: { userId } }),
      this.prisma.decision.count({ where: { userId } }),
      this.prisma.knowledgeItem.count({ where: { userId } }),
      this.prisma.memory.count({ where: { userId } }),
      this.prisma.domainAttentionSample
        .findMany({ where: { userId }, select: { weekOf: true }, distinct: ['weekOf'] })
        .then((rows) => rows.length),
    ]);
    return { people, goals, decisions, knowledge, memories, weeks };
  }
}
