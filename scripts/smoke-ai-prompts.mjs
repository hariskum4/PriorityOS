/**
 * The one check that talks to the real model.
 *
 * Every test in this repo feeds the rephrase guards hand-written rewrites,
 * and a hand-written rewrite preserves the intent of the question because the
 * person writing it meant to. A model does not. That gap shipped a bug: the
 * engine asked "Where were you?", the model returned "Who else was there?",
 * and it passed every static guard — nothing invented, no name dropped, still
 * an open one-sentence question — while silently swapping the facet and
 * leaving the disclosure label describing a box it no longer matched.
 *
 * Nothing offline could have caught that, so this exists and is deliberately
 * outside the test globs: it needs a running API, a database, a live model and
 * an API budget. Run it before a release.
 *
 *   npm run smoke:ai                     # localhost:3001, demo account
 *   API=https://… EMAIL=… PASSWORD=… npm run smoke:ai
 *
 * It asserts invariants rather than strings, because the model is not
 * deterministic and pinning its wording would only produce a flaky test that
 * gets deleted. What must hold is that a rewrite is still the *same question*:
 * same interrogative, no invented names, no verdict on how the evening went,
 * and the control labels untouched.
 *
 * It fails loudly if the model never actually changed anything — with AI off,
 * or every rewrite rejected, this would otherwise pass while proving nothing,
 * which is precisely how the bug above stayed hidden.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  momentPrompts, momentContextOf, isUsableQuestion, isUsableAccountLine, sameInterrogative,
} = require('../packages/scoring-engine/dist/index.js');

const API = process.env.API ?? 'http://localhost:3001';
const EMAIL = process.env.EMAIL ?? 'demo@priority.app';
const PASSWORD = process.env.PASSWORD ?? 'demo@4321';
/** How long to give a deferred generation before reading it back. */
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 9000);

const violations = [];
const changed = [];
let token = '';

const call = async (method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
};

const fail = (probe, field, why) => violations.push({ probe, field, why });

const daysAgoIso = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Probes chosen to land on different facets, so the model is exercised on the
 * whole shape of the surface rather than on one question five times. Each has
 * a distinct engine output, which is also what forces a distinct cache key and
 * therefore a real generation per probe.
 */
const PROBES = [
  {
    name: 'person, nothing written — the `said` probe',
    body: { title: 'A long call with Amma', memoryType: 'relationship', peoplePresent: ['Amma'], occurredAt: daysAgoIso(2) },
  },
  {
    name: 'person, talk already written — falls through to sensory',
    body: {
      title: 'Dinner with the phones away', memoryType: 'relationship', peoplePresent: ['Amma'],
      reflection: 'Forty minutes. We talked about her sister, then about nothing.', occurredAt: daysAgoIso(3),
    },
  },
  {
    name: 'alone achievement — the `did` probe',
    body: { title: 'Finished the thing nobody asked for', memoryType: 'achievement', peoplePresent: [], occurredAt: daysAgoIso(1) },
  },
  {
    name: 'a crowd — the plural',
    body: { title: 'Everyone came for lunch', memoryType: 'experience', peoplePresent: ['Amma', 'Appa', 'Rahul'], occurredAt: daysAgoIso(40) },
  },
  {
    name: 'hard, and a year on — the reconsolidation question',
    body: {
      title: 'The week in the hospital', memoryType: 'experience', peoplePresent: [],
      reflection: 'It was the worst week. I cried in the car park every evening.',
      occurredAt: daysAgoIso(800),
    },
  },
];

/** Capitalised words a rewrite may legitimately contain. */
const ALLOWED_CAPS = new Set(['I', 'What', 'Where', 'Who', 'Why', 'When', 'How', 'The', 'A', 'It',
  'You', 'Your', 'That', 'This', 'And', 'But', 'Not', 'One', 'Every', 'Each', 'Today', 'Nothing']);
const VERDICT = /\b(lovely|great|wonderful|well done|good job|proud|amazing|special|beautiful|brave)\b/i;

async function main() {
  console.log(`\n  smoke: ${API}\n  as:    ${EMAIL}\n`);

  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (!login.ok) {
    console.error(`  login failed (${login.status}). Nothing was tested.`);
    process.exit(1);
  }
  token = login.json.accessToken;

  const created = [];
  try {
    for (const probe of PROBES) {
      const made = await call('POST', '/memories', probe.body);
      if (!made.ok) { fail(probe.name, 'create', `HTTP ${made.status}`); continue; }
      created.push({ id: made.json.id, probe });
    }

    /**
     * Prime, then wait, then read.
     *
     * `/prompts` defers: the *first* call returns the engine's own copy and
     * kicks the model off behind it. Waiting before ever calling it — which
     * this script did at first — asks a question nobody has started answering,
     * and then reads the fallback and reports that the model changed nothing.
     */
    for (const { id } of created) await call('GET', `/memories/${id}/prompts`);
    console.log(`  ${created.length} probes primed; waiting ${SETTLE_MS}ms for the generations…\n`);
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    for (const { id, probe } of created) {
      const res = await call('GET', `/memories/${id}/prompts`);
      if (!res.ok) { fail(probe.name, 'GET /prompts', `HTTP ${res.status}`); continue; }
      const got = res.json;

      /* The engine's own answer for the same moment — the thing the model was
         handed, and the baseline every invariant is measured against. */
      const stored = await call('GET', '/memories');
      const row = (stored.json ?? []).find((m) => m.id === id);
      const engine = momentPrompts(momentContextOf(row ?? probe.body));

      const QUESTIONS = ['insight', 'conversation', 'keepsake'];
      for (const field of QUESTIONS) {
        const v = got[field];
        if (typeof v !== 'string' || !v.trim()) { fail(probe.name, field, 'missing'); continue; }
        if (!isUsableQuestion(v)) fail(probe.name, field, `not a usable question: "${v}"`);
        if (!sameInterrogative(engine[field], v)) {
          fail(probe.name, field, `interrogative changed: "${engine[field]}" -> "${v}"`);
        }
        if (v.includes('%s')) fail(probe.name, field, 'unfilled %s placeholder');
        if (VERDICT.test(v)) fail(probe.name, field, `passes verdict on the moment: "${v}"`);
        const invented = (v.match(/(?<=[a-z,;:)]\s)[A-Z][a-zA-Z'’-]+/g) ?? [])
          .filter((w) => !ALLOWED_CAPS.has(w) && !engine[field].includes(w));
        if (invented.length) fail(probe.name, field, `invented name(s): ${invented.join(', ')}`);
        if (v !== engine[field]) changed.push(`${probe.name} · ${field}`);
      }

      if (!isUsableAccountLine(got.reflection)) {
        fail(probe.name, 'reflection', `not a usable account line: "${got.reflection}"`);
      }
      /* Control labels are never model-edited: a reworded control is a
         different control, and the label has to describe the box it opens. */
      if (got.probeLabel !== engine.probeLabel) {
        fail(probe.name, 'probeLabel', `model-edited: "${engine.probeLabel}" -> "${got.probeLabel}"`);
      }
      if (got.disclosure !== engine.disclosure) {
        fail(probe.name, 'disclosure', `model-edited: "${engine.disclosure}" -> "${got.disclosure}"`);
      }
      /* The label names the box beneath it; if the question drifted off its
         facet they stop describing the same thing. */
      if (!got.disclosure.startsWith(got.probeLabel)) {
        fail(probe.name, 'disclosure', 'label and disclosure disagree');
      }

      console.log(`  ✓ ${probe.name}`);
      console.log(`      ? ${got.insight}`);
      console.log(`      2 ${got.conversation}   [${got.probeLabel}]`);
      console.log(`      3 ${got.keepsake}`);
    }
  } finally {
    for (const { id } of created) await call('DELETE', `/memories/${id}`);
    if (created.length) console.log(`\n  cleaned up ${created.length} probe moments.`);
  }

  console.log('');
  if (violations.length) {
    console.error(`  ${violations.length} violation(s):\n`);
    for (const v of violations) console.error(`    ${v.probe}\n      ${v.field}: ${v.why}\n`);
    process.exit(1);
  }

  /**
   * A green run where the model changed nothing proves only that the fallback
   * works, so it is not reported as a pass. But there are two ways to get
   * here and they need different actions — the first version of this message
   * named only one of them and sent a real run off to check a quota that was
   * fine. The model had simply returned the engine's wording untouched, which
   * the prompt explicitly invites it to do.
   */
  if (!changed.length) {
    console.error('  INCONCLUSIVE — nothing was rewritten, so no guard was exercised.');
    console.error('  Two causes, and they are told apart by the `model` column:\n');
    console.error("    select model, count(*) from \"AiRecommendation\"");
    console.error("     where kind='moment_prompts' and \"createdAt\" > now() - interval '10 minutes'");
    console.error('     group by model;\n');
    console.error("    · rows say 'fallback'  → the model never ran. Check AI_ENABLED,");
    console.error('                             AI_API_KEY and the provider quota.');
    console.error('    · rows name a model    → it ran and kept the engine wording, which is');
    console.error('                             allowed. Re-run; it varies between calls.');
    process.exit(2);
  }

  console.log(`  PASS — the model rewrote ${changed.length} field(s) and every one held:`);
  for (const c of changed) console.log(`    · ${c}`);
  console.log('');
}

main().catch((e) => { console.error('  smoke failed:', e); process.exit(1); });
