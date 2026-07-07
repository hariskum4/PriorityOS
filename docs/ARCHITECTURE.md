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
- GET /habits
- POST /habits
- POST /habits/:id/complete

## Journal
- GET /journal
- POST /journal

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

# 15. Final Engineering Principle

Priority must not become “just another habit tracker.”

The architecture should preserve the differentiator:

> **Take the user’s values, relationships, and goals, detect misalignment in how they live, and turn that into daily action through AI + behavioral systems.**
