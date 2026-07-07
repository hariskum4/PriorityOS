# Priority — Research Notes (July 2026)

How market research shaped this MVP. Each finding maps to a concrete implementation decision in this repo.

## 1. Willingness to pay for AI life coaching is validated — differentiation is not

Rosebud (AI journaling, closest analog) raised a $6M seed led by Bessemer with Initialized, 776 and Tim Ferriss participating, charges $12.99/mo, and reports strong therapist-referral distribution. So the category has real money and real retention stories.

But the sharpest recurring criticism of Rosebud is that its AI output is close to what you'd get pasting a journal entry into a free chatbot. That criticism will hit any LLM-first product.

**Decision:** Priority's moat is structural, not prose. The deterministic scoring engine builds a persistent, quantified model of the user's life (importance vs attention per domain, relationship overdue-ness, neglect risk) that a general chatbot cannot maintain. The LLM only narrates over that model (`packages/ai-prompts` contracts enforce this). This is also the honest answer to "why not just use ChatGPT."

## 2. The habit-tracker graveyard: choice overload + streak anxiety

Consistent findings across studies and practitioner writing: roughly 70% of health/behavior app users discontinue within the first 100 days, with the steepest drop in the first weeks. The two most cited mechanisms:

- **Too many habits/features.** Tracking 10+ things dilutes focus and multiplies daily chances to feel like a failure.
- **Rigid streaks.** One broken streak triggers the "what-the-hell effect" — users quit entirely. Streak mechanics are widely criticized as optimizing for early engagement charts, not behavior change.

A third theme: nothing "notices when you go quiet" — apps punish absence instead of re-engaging warmly.

**Decisions:**
- Dashboard surfaces **one** top mission (engine-ranked) + max 2 supporting items (`dashboard.service.ts`).
- Streaks are **frequency-based per week** with **grace tokens** (`streaks.ts`, `habits.service.ts`, `gamification.service.ts`).
- Snoozed missions get a gentle rank *boost* rather than shame copy (`rankMissions`), and drift nudges are capped at one per relationship per week.

## 3. The personal-CRM graveyard: manual entry kills family-relationship tools

Conduit (#1 on Product Hunt), Nat, UpHabit and Garden all shut down or pivoted away from personal relationships. Surviving tools (Dex, Clay/Mesh) survived by going professional — and reviewers consistently note they feel "clinical" or "transactional" for family and close friends. The family/parents use case is genuinely underserved, and the documented failure mode is data-entry friction: DIY and manual CRMs get abandoned in ~3 months.

**Decisions:**
- **One-tap contact logging** — 📞/💬/🏠 on the People screen writes a `ContactLog`, updates `lastContactAt`, and re-scores the relationship in one call (`POST /relationships/:id/contact`).
- **Completing a relationship mission auto-logs contact** — the user never enters the same fact twice (`missions.service.ts`).
- Relationship priority is computed from onboarding facts (closeness, desired cadence, age) + the passive contact log, never from forms the user must maintain.

## 4. Mortality framing: powerful at first exposure, desensitizing daily

WeCroak (5 death reminders/day) is the natural experiment: reviewers consistently report a strong initial perspective shift followed by desensitization within ~2 weeks, after which reminders become "yet another push notification." Psychologists quoted on it flag the quick-fix ceiling of repeated mortality salience.

The PRD's signature "meaningful opportunities remaining" feature sits exactly on this edge.

**Decisions:**
- Opportunity insights are generated at **two moments only**: the onboarding Life Reveal and the weekly review cycle — never daily (`insights.service.ts`).
- Every estimate ships with **explicit assumptions**, an adjustable planning horizon, and no reference to lifespan or death (`opportunity.ts`).
- Every scarcity estimate has an **agency counterpart**: "adding 2 visits a year → 50 instead of 30."
- `insightIntensity` preference: `off | gentle | direct`, honored server-side — `off` returns an empty insight list.

## 5. What retains: the weekly ritual + someone noticing

Long-duration retention in this category correlates with (a) a recurring reflective ritual and (b) the product responding to absence rather than punishing it. Rosebud's weekly summaries and "connect the dots across entries" are its most-praised features.

**Decisions:**
- The weekly review is generated automatically Sunday 18:00, combines hard stats with one honest drift observation, always ends with exactly 3 next-week focus areas, and reading it is itself rewarded (+50 XP) — making the review the retention anchor, not the streak.
- Notifications respect quiet hours and are deduped by `(user, kind, period)` keys — spam is the fastest route to notification-permission revocation.

## 6. Safety posture

An AI product that discusses regret, family estrangement and life dissatisfaction will receive heavy emotional disclosures. Rosebud reviews document how badly under-guardrailed "healing" positioning ages. Priority's copy rules (in `ai-prompts`): never guilt, never mortality, never clinical claims; position as a planning tool. Before public launch this needs a proper crisis-content policy and escalation copy — flagged as a pre-launch requirement, out of MVP scope.

## Open validation questions (pre-launch, Wizard-of-Oz-able)

1. Does the Life Reveal alone (a one-shot experience) create the "wow" — and can it be shipped as a viral web funnel before the full app?
2. Will users grant the contact-log habit, or does even one tap decay? (Instrument: contact logs per WAU, week 2 vs week 6.)
3. Price point: Rosebud anchors $12.99/mo US. For an India-first launch, test ₹299–499/mo against a family-plan angle.
4. The single highest-risk retention metric to watch: **weekly review open rate at week 4** — if that ritual doesn't hold, nothing downstream will.
