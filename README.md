# Priority

**Your calendar tells you where your time went. Priority tells you where your life is going.**

An AI-powered life-prioritization app: it learns what you say matters (values, people, goals), measures what your behavior shows, and closes the gap with one meaningful mission a day, forgiving habits, and an honest weekly review.

## Stack

| Layer | Tech |
|---|---|
| Mobile | React Native + Expo + TypeScript, expo-router, TanStack Query, Zustand |
| API | NestJS + TypeScript, JWT (access + rotating refresh), argon2, rate limiting |
| Data | PostgreSQL + Prisma |
| Jobs | @nestjs/schedule cron (BullMQ/Redis-ready service boundaries) |
| Intelligence | `@priority/scoring-engine` (deterministic, tested) + LLM narrative layer (`@priority/ai-prompts`, OpenAI-compatible, graceful fallbacks) |

## Monorepo

```
priority/
├─ apps/
│  ├─ api/        NestJS REST API (16 modules) + Prisma schema + seed
│  └─ mobile/     Expo app (auth → onboarding → dashboard → missions → review)
├─ packages/
│  ├─ scoring-engine/  Deterministic scoring, streaks, XP, opportunity math (19 tests)
│  ├─ ai-prompts/      LLM prompt templates with strict JSON contracts
│  └─ types/           Shared domain types
└─ docs/          PRD, architecture, build prompt, research notes
```

## Setup

```bash
# 1. Infra
docker compose up -d            # Postgres :5432, Redis :6379

# 2. Install
npm install

# 3. Environment
cp .env.example apps/api/.env   # adjust if needed
cp .env.example apps/mobile/.env

# 4. Database
npm run db:migrate              # prisma migrate dev
npm run db:seed                 # demo@priority.app / priority123

# 5. Run
npm run api:dev                 # API on :3000
npm run mobile:start            # Expo dev server (press i / a / scan QR)
```

The seed account is fully lived-in: relationships (Amma, Appa, Priya, Arjun), pending + completed missions, habits with streaks, a journal entry, an opportunity insight, and last week's review — so every screen renders on first login.

### AI layer

Set `AI_API_KEY` + `AI_BASE_URL` (any OpenAI-compatible endpoint) to enable LLM narratives. With `AI_ENABLED=false` the app is fully functional — every AI touchpoint has a deterministic fallback, and all generations (including fallbacks) are logged to `ai_recommendations` for observability.

**Hard rule:** the LLM writes words; it never computes scores. All prioritization, neglect risk, streaks, XP and opportunity estimates come from the tested deterministic engine.

## Tests

```bash
npm run test:scoring   # 19 unit tests on the scoring engine
```

## Key API endpoints

```
POST /auth/register | /auth/login | /auth/refresh
GET  /me · PATCH /me · GET/PATCH /me/preferences
POST /onboarding/answers · POST /onboarding/complete  → Life Reveal
GET/POST /relationships · POST /relationships/:id/contact   (one-tap log)
GET/POST /goals · GET/POST /missions
POST /missions/:id/complete · POST /missions/:id/snooze
GET/POST /habits · POST /habits/:id/complete
GET/POST /journal
GET  /dashboard · GET /recommendations/today
GET  /insights/opportunities · POST /insights/opportunities/:id/dismiss
GET  /weekly-review/current · POST /weekly-review/generate · POST /weekly-review/acknowledge
GET  /gamification/profile · GET /gamification/domain-xp
GET  /notifications
```

## Product decisions baked into the code (see docs/RESEARCH_NOTES.md)

1. **One mission a day.** The dashboard surfaces exactly one top mission (deterministic ranking) + max two supporting items. Choice overload is the #1 documented killer of this category.
2. **Forgiving streaks.** Habits target a weekly frequency, and a missed period consumes a grace token before resetting — designed against the "what-the-hell effect".
3. **Zero-friction relationship logging.** One tap ("call / message / visit") updates last-contact and re-scores the relationship; completing a relationship mission logs contact automatically. Manual data entry is what killed the personal-CRM graveyard (Nat, Conduit, Garden, UpHabit).
4. **Opportunity insights are rare and estimate-framed.** Generated at onboarding + weekly review only, always with assumptions attached, always with a positive "one change adds X" counterpart, and switchable off (`insightIntensity`). Daily mortality-salience desensitizes users within weeks.
5. **Deterministic core, narrative LLM.** The defensible layer is the scored behavioral model of the user's life, not the prose — the standard criticism of AI coaching apps is "I could paste this into ChatGPT."
6. **Weekly review is the retention ritual.** It is generated automatically Sunday evening, acknowledgment is rewarded, and it names one honest drift risk.
