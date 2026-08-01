# Priority — Technical Architecture Document

**Version:** 1.0  
**Product:** Priority  
**Purpose:** Architecture and engineering blueprint for the MVP  
**Goal:** Build a production-grade, mobile-first AI life-prioritization application

# 1. Architecture Overview

Priority is a **mobile-first AI life operating system** that combines:
- user onboarding and relationship mapping,
- life-domain scoring,
- AI-generated priorities and missions,
- habit tracking,
- journaling,
- weekly reviews,
- gamification,
- notifications,
- opportunity/relationship insights.

The system must support:
- real user authentication and persistence,
- configurable scoring and nudges,
- deterministic calculations for priority and neglect risk,
- LLM-generated summaries and coaching,
- scheduled jobs for reminders and weekly reviews,
- scalable modular backend APIs.

# 2. Recommended Stack

## 2.1 Mobile App
**React Native + Expo + TypeScript**

## 2.2 Backend API
**NestJS + TypeScript**

## 2.3 Database
**PostgreSQL**

## 2.4 ORM
**Prisma**

## 2.5 Queue / Background Jobs
- **Redis**
- **BullMQ**

## 2.6 Notifications
- Expo Notifications / Firebase Cloud Messaging (FCM)

## 2.7 AI Layer
- LLM provider abstraction
- OpenAI-compatible API interface
- prompt templates stored in DB/config
- strict input/output contracts

# 3. High-Level System Components

## 3.1 Client Layer
### Mobile App
Screens:
- auth
- onboarding
- home dashboard
- missions
- habits
- journal
- relationships
- goals
- calendar
- weekly review
- profile/settings

## 3.2 API Layer
NestJS REST API serving:
- auth
- profile
- onboarding
- relationships
- domains
- goals
- missions
- habits
- journal
- dashboard
- insights
- AI recommendations
- weekly review
- gamification
- notifications
- admin config

## 3.3 Core Intelligence Layer
Contains:
1. **Priority Scoring Engine**
2. **Relationship Insight Engine**
3. **Opportunity Estimation Engine**
4. **Weekly Review Generator**
5. **Mission Recommendation Engine**
6. **Nudge / Reminder Decision Engine**

# 4. Suggested Monorepo Structure

```txt
priority/
├─ apps/
│  ├─ mobile/
│  ├─ api/
│  └─ admin/
├─ packages/
│  ├─ ui/
│  ├─ types/
│  ├─ scoring-engine/
│  ├─ ai-prompts/
│  ├─ analytics/
│  └─ utils/
├─ docs/
│  ├─ PRD.md
│  ├─ ARCHITECTURE.md
│  └─ BUILD_PROMPT.md
├─ .env.example
├─ docker-compose.yml
└─ package.json
```

# 5. Backend Module Design

Core modules:
1. auth
2. users
3. onboarding
4. relationships
5. life-domains
6. goals
7. missions
8. habits
9. journal
10. dashboard
11. insights
12. ai-engine
13. weekly-review
14. gamification
15. notifications
16. admin-config

# 6. Core Tables

- users
- user_preferences
- onboarding_answers
- relationships
- life_domains
- goals
- missions
- habits
- habit_logs
- journal_entries
- opportunity_insights
- ai_recommendations
- weekly_reviews
- gamification_profiles
- domain_xp_ledger
- notifications
- app_config

# 7. Example Table Definitions

## users
```sql
users (
  id uuid pk,
  email varchar unique not null,
  password_hash varchar null,
  full_name varchar not null,
  dob date null,
  timezone varchar not null,
  city varchar null,
  country varchar null,
  profession varchar null,
  work_type varchar null,
  work_hours_per_week int null,
  marital_status varchar null,
  children_count int default 0,
  onboarding_completed boolean default false,
  preferred_language varchar default 'en',
  motivation_style varchar default 'balanced',
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

## relationships
```sql
relationships (
  id uuid pk,
  user_id uuid references users(id),
  name varchar not null,
  relation_type varchar not null,
  age int null,
  city varchar null,
  closeness_score int null,
  in_person_frequency varchar null,
  call_frequency varchar null,
  wants_more_time boolean default true,
  meaningful_moment_types jsonb default '[]',
  notes text null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

## missions
```sql
missions (
  id uuid pk,
  user_id uuid references users(id),
  relationship_id uuid null references relationships(id),
  goal_id uuid null references goals(id),
  title varchar not null,
  description text null,
  domain_type varchar not null,
  mission_type varchar not null,
  priority_score numeric(5,2) default 0,
  due_date timestamptz null,
  recurrence_rule varchar null,
  estimated_minutes int null,
  energy_level varchar null,
  xp_reward int default 0,
  status varchar default 'pending',
  source_type varchar default 'AI',
  completed_at timestamptz null,
  snooze_count int default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

# 8. API Design

## Auth
- POST /auth/register
- POST /auth/login
- POST /auth/refresh

## User
- GET /me
- PATCH /me
- GET /me/preferences
- PATCH /me/preferences

## Onboarding
- POST /onboarding/answers
- GET /onboarding/answers
- POST /onboarding/complete

## Relationships
- GET /relationships
- POST /relationships
- PATCH /relationships/:id
- DELETE /relationships/:id

## Goals
- GET /goals
- POST /goals
- PATCH /goals/:id

## Missions
- GET /missions
- POST /missions
- PATCH /missions/:id
- POST /missions/:id/complete
- POST /missions/:id/snooze

## Habits
- GET /habits — active only; `?all=1` includes retired
- POST /habits
- POST /habits/:id/complete
- POST /habits/:id/retire
- POST /habits/:id/restore

## Journal
- GET /journal
- POST /journal

## Memories / countables
- GET /memories — `?person=` `?countKey=`
- POST /memories
- PATCH /memories/:id
- DELETE /memories/:id
- GET /memories/on-this-day
- GET /memories/counts-summary — per ritual: count, firstAt, lastAt, people
- GET /memories/count-candidates — untagged moments matching a counted ritual
- GET /memories/archive-themes — words recurring in untagged moments
- POST /memories/count-attach — fold chosen moments into a ritual's count

## Dashboard
- GET /dashboard

## Insights
- GET /insights/opportunities
- GET /recommendations/today

## Weekly review
- GET /weekly-review/current
- POST /weekly-review/generate

# 9. Scoring Engine

The scoring engine should calculate:
- importance_score
- attention_score
- neglect_risk_score
- current_score
- relationship_priority_score

Inputs include:
- ranked priorities
- goals per domain
- recent mission completions
- habit completions
- journal themes
- snooze frequency
- days since last meaningful action

# 9a. Rhythms — where a habit comes from, and how one ends

A habit is the only object in the system that represents a *standing*
commitment. Missions are errands: done once, +XP, gone. Getting the
distinction wrong is not cosmetic — a rung reading "make the call a standing
weekly thing", marked complete on a Tuesday and never seen again, is the app
agreeing the rhythm is finished before it has begun.

**Where they come from.** Three surfaces, all reading the same two engine
sources so they cannot drift apart:

| Surface | Source | Currency |
|---|---|---|
| Healthspan card (Time tab) | `HEALTHSPAN_LEVERS` in `lifeStrategy.ts` | population years (`+3 yrs`) |
| Domain screen ladder | `domainLadder.ts` rungs marked `recurring` | the rung itself |
| Constellation, open domain (Today) | `rhythmRungFor()` | the rung itself |

The years currency **does not travel past the healthspan card**. Those four
figures are compression-of-morbidity estimates and are the same for every
reader; there is no research attaching years to a weekly money review. A
domain outside the four is argued for from the app's own data — importance,
neglect risk, and the observed cadence from `/life-os/rhythm` — never from a
borrowed number. See RESEARCH_NOTES §4 for why an invented figure here is
the specific failure mode this product cannot afford.

**The recurring marker.** `LadderRung.recurring = { perWeek }` promotes a rung
from mission to habit. `perWeek` is an integer because `Habit.targetPerWeek`
is, so only cadences of a week or tighter can be marked. Monthly and yearly
rungs ("a standing monthly catch-up", "one real trip a year") stay missions —
marking them would ask four and fifty-two times too often — and the three
domains that ended on one were given a weekly rung of their own instead.
A rhythm nobody could keep is worse than no rhythm.

**Taken means taken.** Every suggestion surface must pass existing habit
titles, *including retired ones*, into the taken set (`GET /habits?all=1`).
Without it a rung taken as a rhythm never lands in missions and is re-offered
on every render; with only active ones, retiring a rhythm makes the app
suggest it again the next morning.

**Retiring, not deleting.** `POST /habits/:id/retire` sets `isActive = false`
and touches nothing else. The streak, the logs and the XP already awarded all
stay — someone who kept a rhythm for six months and no longer needs it has
not made a mistake to undo, and erasing the evidence that they did the thing
is the opposite of what this app is for. `restore` picks it back up with the
streak intact. This path is a hard prerequisite for suggesting rhythms across
twelve domains, not a follow-up: a person carrying ten of them needs a way to
end some, and "delete" is the wrong verb.

# 9b. Countables — a ritual, its pace, and who it is with

A habit is a rhythm someone is keeping now. A **countable** is different: a
ritual with a finite number of repetitions left in a life — ocean swims,
Diwalis at home, road trips with Amma. `packages/scoring-engine/countables.ts`
owns all of it; the Time tab only renders.

**The pace must be observed or labelled.** `perYear` came from a 1/2/4/12
chip tapped once at creation and never moved, so the card printed "~150 more
treks at your current pace" over an archive holding zero treks. The rule now:

| archive holds | pace used | what the row says |
|---|---|---|
| 0 | declared | "a plan, not a pace" |
| 1 | declared | "a start, not yet a rhythm" |
| ≥2 | **observed** | the real rate, and whether it beats what they set |

Two occurrences is the floor — the same "a rhythm claimed from one data point
is not a rhythm" rule the domain sky uses. The denominator is the span since
the first logged occurrence, floored at one year, and it measures *since they
started logging*, never their whole life. Five different sentences, because
four rows sharing one template read as none.

**One ritual, one row.** `countKeyOf()` stems a label to its meaningful words
so "treks" and "Went to trek" land on one key. `matchRitual()` returns `same`
(identical word set — merge) or `similar` (one contains the other — ask, never
merge, since "treks with Appa" may be its own ritual). Twins that predate the
check collapse via `dedupeRituals()` at **read** time, not by deleting a row:
merging a display costs nothing, and deleting the wrong one of a pair costs
moments. The row names what it folded.

**People, and the §4 constraint.** A countable can be bound to relationships,
and the shared number comes from `estimateTimeReality().qualityYears` so the
person math has exactly one implementation. Where nobody was named, the
archive answers instead — `peoplePresent` on a counted memory already knows
Diwali means Amma. This is the most emotionally loaded surface in the app, so
it inherits RESEARCH_NOTES §4 without exception: arithmetic not warning, the
agency counterpart always attached, no lifespan vocabulary, and the whole tile
suppressed when `insightIntensity` is `off`. The engine's own test suite
asserts the forbidden register.

**Suggestions come from this life.** Four sources, ranked by how much they
belong to this person, each carrying a `because` in their own terms:

1. `meaningfulMomentTypes` on a relationship — their words, already bound to
   a name. Collected at onboarding and, until this change, never read.
2. `GET /memories/archive-themes` — a word recurring in ≥2 untagged moments.
3. People with `wantsMoreTime`, shaped by relation type.
4. A high-importance domain with nothing counted in it — last resort.

Capped at one per person, so two moments someone named cannot take two of
three slots; a second pass relaxes that rather than returning a short list.
Nothing already counted is ever offered, and near-duplicates lose.

**Offer, never attribute.** `count-candidates` surfaces untagged archive
moments matching a ritual and they are folded in only on a tap. A number
someone cannot explain is worse than a smaller one they can — the same reason
the pace is labelled rather than guessed.

**The fixed-category cards this replaced are gone.** `booksRemaining`,
`tripsRemaining` and `annualMoments` are deleted, and with them the card that
asked everyone for books-a-year and trips-a-year. They were the same Tail End
arithmetic one card above `countable()`, minus the archive, minus the people,
minus persistence — the pace lived in `useState(12)` / `useState(2)` and reset
on every tab switch while the copy read it back as "at your pace". Books and
trips survive as domain-sourced entries in `RITUAL_BY_DOMAIN` (`growth` →
books finished, `experiences` → trips somewhere new), offered only to a reader
who rates that domain highly and counts nothing in it. The section's collapsed
preview — the most-seen line on the tab — now renders this person's own top
two counts, or says "nothing counted yet".

The Experiences domain screen quoted the same fabricated figure from a literal
`tripsRemaining(age, 2)`, one line above an invitation to go and state a pace.
It now resolves the reader's own travel ritual through `DOMAIN_COUNT_PROBES`
(single-token probes — `matchRitual` needs a subset, so "trips" finds "road
trips with Sheetal" where the full phrase would not; several per domain
because one person counts treks and the next counts trips) and quotes nothing
at all when they count nothing.

# 9c. The screen trade — a stated hour, and a door for it

`screenTrade(age, hoursPerDay)` prices an hour a day against the planning
horizon. Two things were wrong with it and both are structural rather than
cosmetic:

**The hours are a fact about the person, so they live on `User`.**
`screenHoursPerDay Int?` — nullable because "unset" is the majority case and
has to be representable. The function returns `basis: 'stated' | 'unknown'`
and, on `unknown`, `wakingYearsOnScreens: null` and copy that quotes no figure
about the reader. This is the sleep rule from §4 of RESEARCH_NOTES applied
again: where the direction is known and the magnitude is not, say the
direction. What one hour is worth (~22 waking days a year) is arithmetic on
the *offer*, not a claim about the reader, so it survives `unknown` — that is
the line between the two halves.

**An hour handed back is worth the thing it is handed back to.** The reclaim
sentence was the only actionable line on the tile and it ended in a full stop.
The offer now names a destination: the domain with the widest `domainShares`
shortfall that has no active rhythm, via `rhythmRungFor()`. Two details that
are easy to get wrong —

- It quotes `claimed`/`received` shares, not `shortfall`. Shortfall is tenths
  of a percentage point; rounded for display it rendered "the furthest behind
  — 0 points short", which is both meaningless and self-contradicting.
- The acknowledgement is held in its own state, not derived from the offer.
  Taking the rhythm gives that domain a rhythm, so the offer that produced it
  is correctly gone by the time the answer renders — reading the confirmation
  off the offer made the row silently vanish on tap, which is what a failure
  looks like.

# 10. AI Engine

Use **hybrid intelligence**:
- deterministic engine for scoring and state
- LLM for language, summaries, coaching, and recommendation framing

LLM use cases:
1. onboarding summary / life reveal
2. daily mission explanation
3. weekly review narrative
4. relationship coaching message
5. journal summarization

# 11. Background Jobs

Queues:
1. notifications.queue
2. weekly-review.queue
3. ai-recommendation.queue
4. streak-recalc.queue
5. analytics-rollup.queue

Jobs:
- morning dashboard refresh
- weekly review generation
- reminder notifications
- streak recalculation
- AI recommendation refresh

# 12. Mobile App Architecture

Suggested structure:
```txt
apps/mobile/src/
├─ app/
├─ screens/
├─ components/
├─ features/
│  ├─ auth/
│  ├─ onboarding/
│  ├─ dashboard/
│  ├─ missions/
│  ├─ habits/
│  ├─ journal/
│  ├─ relationships/
│  ├─ weeklyReview/
│  └─ settings/
├─ services/
├─ store/
├─ hooks/
├─ theme/
└─ utils/
```

Recommended libraries:
- TanStack Query
- Zustand
- React Hook Form
- Zod

## 12.1 Hooks below an early return — the cold-start trap

**Every hook must sit above every early return in a screen.** This is the
ordinary rule of hooks, and it is written down here because in this codebase
breaking it produces a bug that passes review, passes `tsc`, passes every
test, and works perfectly on the machine of whoever wrote it.

The reason is the persisted query cache. Query results are written to
`localStorage`/AsyncStorage under `priority-query-cache-v1`, so on any device
that has opened the app before, `data` and `me` are populated on the very
first render and the loading branch is never taken. Hook counts match, and
nothing is ever wrong. On a device *without* that cache — a fresh install,
cleared storage, a new user — the first render returns early with fewer
hooks, the second renders with more, and React throws:

```
Rendered more hooks than during the previous render
```

The screen dies to an error boundary. It is the first thing a new user sees,
and it is invisible to everyone who already has the app installed.

Two screens shipped with this — `(tabs)/time.tsx` and `(tabs)/index.tsx`,
each with `useMemo`s below an `if (!data)` / `if (!me)` return. Both were
found only by clearing the cache deliberately. Both now carry a comment at
the moved block saying why it stays where it is.

**Practical rules:**
- New `useState` / `useMemo` / `useQuery` / `useMutation` goes at the top of
  the component, never next to the JSX that uses it.
- Derived values needed *after* an early return and computable *before* it
  should move up; anything genuinely dependent on loaded data belongs in a
  module-level plain function taking that data as an argument (see
  `heldContents()` in `(tabs)/index.tsx`).
- **Verify cold.** Clearing `priority-query-cache-v1` and reloading is the
  only way to exercise this path. A warm reload proves nothing.

# 13. Security & Observability

Security:
- JWT access + refresh token rotation
- bcrypt/argon2 password hashing
- DTO validation
- rate limiting on auth and AI endpoints

Observability:
- structured logs
- request IDs
- AI generation failure tracking
- notification delivery tracking

# 14. Testing Strategy

Backend:
- unit tests for scoring engine
- integration tests for auth/dashboard
- worker tests for notifications/weekly reviews

Mobile:
- onboarding flow tests
- mission completion flow tests
- dashboard API integration smoke tests
- **a cold-start pass on every tab** — clear the persisted query cache and
  load each screen. The warm path hides hook-order crashes entirely (§12.1);
  a fresh install is the one session where they all fire at once.

# 15. Final Engineering Principle

Priority must not become “just another habit tracker.”

The architecture should preserve the differentiator:

> **Take the user’s values, relationships, and goals, detect misalignment in how they live, and turn that into daily action through AI + behavioral systems.**
