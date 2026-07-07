# Priority — Master AI Build Prompt

**Purpose:** Give this file to Cursor / Claude Code / GPT / Lovable / another AI coding assistant to generate the Priority app in a structured, production-grade way.

# 1. Your Role

You are a **senior product engineer, mobile architect, backend architect, AI systems designer, and startup CTO**.  
Your task is to build **Priority**, a fully functional MVP for an AI-powered life-prioritization app.

This is not a generic todo app.  
It is an **AI Life Operating System** that helps users understand what matters most, detect where their life is drifting, and turn values like family, health, relationships, and growth into daily missions.

You must build this as a **real runnable codebase**, not a conceptual mockup.

# 2. Product Context

Priority helps users answer this question:

> **“What should I do today so I don’t regret postponing what matters most?”**

The app should combine:
- onboarding and life discovery
- values and goals mapping
- relationship tracking
- AI-generated daily priorities
- missions and habits
- life-domain scoring
- meaningful-opportunity insights
- weekly reviews
- journaling
- gamification
- reminders and nudges

# 3. What You Must Build

Build a **production-grade MVP** with the following components:

## 3.1 Apps
1. **Mobile app** using **React Native + Expo + TypeScript**
2. **Backend API** using **NestJS + TypeScript**
3. Optional lightweight **admin/config dashboard** if time allows

## 3.2 Core Features
1. Authentication
2. Onboarding / Life Discovery Questionnaire
3. Relationship mapping
4. Goals + life domains
5. AI Priority Engine
6. Dashboard / Today view
7. Missions / habits
8. Journal / reflection
9. Weekly review
10. Notifications / reminders
11. Gamification (XP, streaks, badges)
12. Opportunity / meaningful-time insights
13. User settings / preferences

# 4. Non-Negotiable Product Rules

1. Do **not** build a normal todo app.
2. The system must focus on **meaningful life priorities**, not just productivity.
3. The app must use **missions** and **life domains**, not only tasks.
4. The AI engine must combine **deterministic scoring + LLM narrative generation**.
5. Opportunity / remaining-time insights must be **approximate and clearly framed as estimates**.
6. The app must feel emotionally warm, modern, motivating, and premium.
7. Core flows must be functional end-to-end: onboarding → dashboard → missions → completion → weekly review.
8. Do not fake backend behavior with hardcoded-only screens for core flows.

# 5. Source Documents You Must Follow

Use the following documents as the source of truth:
1. `PRD.md`
2. `ARCHITECTURE.md`

# 6. Required Monorepo Structure

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

# 7. Tech Stack Requirements

## Mobile
- React Native
- Expo
- TypeScript
- Expo Router or React Navigation
- TanStack Query
- Zustand
- React Hook Form
- Zod

## Backend
- NestJS
- TypeScript
- Prisma + PostgreSQL
- Redis + BullMQ
- class-validator / DTO validation
- JWT auth
- modular services
- REST APIs

# 8. Build Order — You Must Follow This Sequence

## Phase 1 — Project Setup
1. Initialize monorepo
2. Set up mobile app skeleton
3. Set up NestJS API skeleton
4. Set up shared package structure
5. Configure linting, formatting, TypeScript, env management
6. Add docker-compose for Postgres + Redis

## Phase 2 — Database + Backend Foundation
1. Create Prisma schema based on `ARCHITECTURE.md`
2. Add migrations
3. Seed baseline app config and demo data
4. Build auth module
5. Build users/preferences module
6. Build onboarding module
7. Build relationships module
8. Build goals module
9. Build missions module
10. Build habits module
11. Build journal module

## Phase 3 — Core Product UX
1. Build mobile auth screens
2. Build onboarding stepper
3. Build dashboard screen
4. Build missions screen
5. Build habit tracking flows
6. Build journal flow
7. Build relationship list/detail
8. Build profile/settings

## Phase 4 — Intelligence Layer
1. Build scoring engine package
2. Build domain scoring service
3. Build relationship priority logic
4. Build opportunity insight engine
5. Build AI recommendation service abstraction
6. Build dashboard recommendation aggregation
7. Build weekly review generator

## Phase 5 — Engagement Systems
1. Add gamification XP + streak logic
2. Add notification scheduling
3. Add daily mission nudges
4. Add weekly review reminders
5. Add analytics events

## Phase 6 — Polish + Hardening
1. Improve empty states and loading states
2. Add optimistic UI where useful
3. Add test coverage for core services
4. Add README and setup docs
5. Add environment template
6. Ensure project runs locally end-to-end

# 9. Backend Modules To Implement

Create these modules inside the NestJS API:
- auth
- users
- onboarding
- relationships
- life-domains
- goals
- missions
- habits
- journal
- dashboard
- insights
- ai-engine
- weekly-review
- gamification
- notifications
- admin-config

# 10. Required API Endpoints

At minimum, implement:
- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/refresh`
- GET `/me`
- PATCH `/me`
- POST `/onboarding/answers`
- POST `/onboarding/complete`
- GET `/relationships`
- POST `/relationships`
- GET `/goals`
- POST `/goals`
- GET `/missions`
- POST `/missions`
- POST `/missions/:id/complete`
- GET `/habits`
- POST `/habits/:id/complete`
- GET `/journal`
- POST `/journal`
- GET `/dashboard`
- GET `/insights/opportunities`
- GET `/recommendations/today`
- GET `/weekly-review/current`

# 11. AI Engine Requirements

Implement a dedicated AI service abstraction.

Use AI for:
- onboarding summary / life reveal
- daily recommendation explanations
- weekly review narrative
- journal summaries
- personalized nudges

Do **not** use AI for deterministic scoring calculations.

# 12. Scoring Engine Requirements

Create a shared `scoring-engine` package with deterministic functions for:
- `calculateImportanceScore()`
- `calculateAttentionScore()`
- `calculateNeglectRiskScore()`
- `calculateDomainScore()`
- `calculateRelationshipPriorityScore()`

Make weights configurable through `app_config`.

# 13. Gamification Requirements

Implement:
- XP awarding on mission completion
- streak updates for habits and daily usage
- level progression
- domain-specific XP ledger
- badge-ready structure

# 14. Notifications Requirements

Implement a notification system for:
- daily mission reminders
- streak reminders
- weekly review reminders
- relationship drift nudges

It must respect:
- quiet hours
- user preferences
- duplicate-spam prevention

# 15. Weekly Review Requirements

Weekly review generation must combine:
- completed missions
- completed habits
- journal entries
- domain score changes
- missed priorities
- top wins
- next week recommendations

Store generated reviews in `weekly_reviews`.

# 16. Output Format — How You Should Respond While Building

When generating the implementation, do not dump everything randomly.

Work in structured increments:

## First response
Give:
1. monorepo folder structure
2. tech choices summary
3. Prisma schema
4. environment variable list
5. step-by-step implementation plan

Then continue module by module:
1. backend foundation
2. auth module
3. onboarding module
4. relationships/goals/missions/habits/journal
5. scoring engine
6. dashboard
7. AI layer
8. mobile app integration
9. notifications and weekly review

# 17. Seed / Demo Data Requirement

Provide a script that seeds:
- one demo user
- sample parents / spouse / friend relationships
- a few missions
- habits
- life domain scores
- sample weekly review
- sample opportunity insight

# 18. README Requirement

Generate a `README.md` that includes:
- project overview
- stack
- setup steps
- env vars
- how to run backend
- how to run mobile app
- how to run migrations / seed
- how to run tests

# 19. Final Build Goal

Build **Priority** as a product that acts like a **life operating system**.

It should:
- understand what the user values,
- identify where they are drifting,
- create daily missions to close the gap,
- motivate them through AI coaching and gamification,
- and help them spend more time on what matters most.
