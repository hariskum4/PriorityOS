# Priority — Product Requirements Document (PRD)

**Version:** 1.0  
**Product Name:** Priority  
**Tagline:** *Your calendar tells you where your time went. Priority tells you where your life is going.*  
**Document Owner:** Founder / Product Team  
**Status:** Draft for MVP Build

---

# 1. Executive Summary

## 1.1 What is Priority?
**Priority** is an AI-powered **Life Operating System** that helps people spend more time on what matters most before life slips away into autopilot.

It is **not** a generic productivity or to-do app.

Priority helps users:
- identify what truly matters across life domains,
- quantify the gap between what they say matters and how they actually spend their time,
- convert long-term values into **daily missions**,
- build meaningful habits around family, health, finances, relationships, and personal growth,
- reduce future regret through **AI-guided prioritization, finite-time awareness, and gamification**.

The app’s core promise is:

> **“What should I do today so I don’t regret postponing what matters most?”**

---

# 2. Problem Statement

## 2.1 The problem
Modern adults are busy but not necessarily intentional.

They are often consumed by:
- jobs,
- deadlines,
- commuting,
- admin work,
- digital distraction,
- family logistics,
- short-term urgencies.

As a result, they postpone what they care about most:
- calling parents,
- spending time with spouse or children,
- improving health,
- saving money,
- building friendships,
- taking meaningful trips,
- pursuing personal goals,
- addressing neglected relationships.

The issue is not only poor productivity.  
The deeper issue is **misalignment between values and behavior**.

People commonly say:
- “I’ll visit home next month.”
- “I’ll focus on health after this quarter.”
- “I’ll spend more time with family when work settles down.”

But years pass, and regret compounds.

---

# 3. Core Insight

People don’t just need better task management.  
They need **better life prioritization**.

Priority transforms:
- **abstract time** → into **concrete opportunities**
- **stated values** → into **actionable missions**
- **good intentions** → into **consistent habits**
- **regret risk** → into **early intervention**

Examples:
- “At your current pace, you may only have ~28 in-person visits with your parents over the next 10 years.”
- “You say health is a top priority, but only 2% of your weekly time is invested in it.”
- “You’ve postponed one important friend catch-up for 3 months.”
- “You’ve had 5 straight weekends with no meaningful family time.”

---

# 4. Product Vision

## 4.1 Vision Statement
Build the **AI operating system for meaningful living** — a product that helps users continuously align their daily actions with what matters most in life.

## 4.2 Mission
Help users reduce future regret by turning life priorities into daily action.

## 4.3 Product Positioning
Priority sits at the intersection of:
- productivity
- journaling
- life design
- relationship management
- wellness
- AI coaching
- habit building

It is **closer to an AI life coach** than a task manager.

---

# 5. Product Principles

1. **Meaning over busyness**  
   The app should optimize for what matters, not just what is urgent.

2. **Action over inspiration**  
   Emotional insights must lead to concrete tasks, rituals, and plans.

3. **Personalization over generic advice**  
   Recommendations should be based on the user’s life stage, family context, goals, routines, and actual behavior.

4. **Gentle truth, not fear**  
   The app can show uncomfortable misalignment, but it must do so with compassion and usefulness.

5. **Behavior change through systems and rewards**  
   Missions, streaks, XP, and feedback loops are critical.

6. **Privacy and emotional safety first**  
   Time-opportunity estimates are approximate planning tools, not deterministic life predictions.

---

# 6. Target Users

## 6.1 Primary Users

### A. Busy Professionals (25–45)
- working full-time or running a business
- overwhelmed and stretched thin
- feel they are neglecting health, parents, spouse, or personal goals

### B. People Living Away from Family
- live in a different city/country from parents or siblings
- feel guilty about not visiting enough
- want structure and nudges for staying connected

### C. Young Parents / Married Adults
- want to spend more intentional time with spouse/children
- struggle with balancing work and family

### D. Ambitious but Misaligned Individuals
- care about growth and success
- know they are busy with the wrong things
- want clarity on what deserves attention

### E. Reflective Self-Improvement Users
- interested in journaling, Stoicism, productivity, life design, and habit systems

---

# 7. Jobs To Be Done (JTBD)

Users hire Priority to:

1. **Tell me what actually matters this week**
2. **Show me where my life is drifting**
3. **Help me spend more time with the people I care about**
4. **Turn values like “family” or “health” into a concrete weekly plan**
5. **Give me one meaningful action to do today**
6. **Help me avoid future regret**
7. **Keep me consistent through reminders, streaks, and rewards**
8. **Give me an honest weekly review of how I spent my life energy**

---

# 8. Product Scope

## 8.1 MVP Goal
Ship a **fully functional mobile-first MVP** that allows a user to:
- complete onboarding,
- define values, relationships, and goals,
- receive AI-generated life priorities,
- get daily missions and recurring habits,
- track progress,
- view life-domain insights,
- receive reminders,
- complete weekly reviews,
- earn XP and streaks.

## 8.2 MVP Modules
1. Authentication
2. Onboarding / Life Discovery Questionnaire
3. Relationship mapping
4. Goals and life domains
5. AI Priority Engine
6. Missions / habits / routines
7. Dashboard / Today View
8. Journal / reflection
9. Weekly review
10. Notifications / reminders
11. Gamification (XP, streaks, badges)
12. Settings / preferences

---

# 9. Core User Journey

## 9.1 Onboarding → Reveal → Daily Use → Weekly Review

### Step 1: Install and emotional onboarding
The user installs Priority because they feel life is moving too fast and they are neglecting important areas.

### Step 2: Life Discovery Questionnaire
The app asks:
- who matters most
- what matters most
- what is being neglected
- current routines and time usage
- goals and regrets
- relationship frequency and desired improvements

### Step 3: Life Reveal
The app produces:
- top priorities
- life-domain scores
- neglect-risk insights
- meaningful-opportunity estimates
- first weekly mission plan

### Step 4: Daily use
Every day the app shows:
- today’s top mission
- supporting habits/tasks
- streaks and XP
- quick reflection prompt
- progress toward domains and goals

### Step 5: Weekly review
Every week the app summarizes:
- what the user completed
- where time went
- what was neglected
- which priorities are drifting
- what to focus on next week

---

# 10. Feature Requirements

# 10.1 Authentication
**MVP**
- Email/password signup
- Login/logout
- Forgot password
- JWT/refresh token session management
- Google sign-in (if feasible in MVP)

# 10.2 Onboarding / Life Discovery

## Sections

### A. Profile
- name
- age / DOB
- city / country / timezone
- profession / work type
- work hours
- marital status
- children
- living away from parents or not

### B. Values & priorities
- rank life priorities
- top 3 regret risks
- neglected areas
- what they want more of

### C. Relationship mapping
For important people:
- name
- relationship type
- age / age range
- city
- visit frequency
- call/message frequency
- closeness score
- desire to spend more time
- preferred meaningful activities

### D. Lifestyle & time use
- work hours
- commute
- sleep
- exercise
- family time
- weekend availability
- entertainment / screen time estimate

### E. Goals
- 1-year goals
- 5-year goals
- health, finance, relationship, career goals

### F. Motivation preferences
- reminder tone
- accountability style
- preferred reminder time
- gamification preference

# 10.3 Life Domains
The app must support at least these domains:
1. Family / Parents
2. Partner / Marriage
3. Children / Parenting
4. Health
5. Career
6. Finance
7. Personal Growth
8. Friends / Social
9. Experiences / Adventure
10. Reflection / Spirituality

Each domain should have:
- importance score
- attention score
- current health score
- neglect risk score
- trend
- recommended actions

# 10.4 AI Priority Engine
This is the core intelligence layer.

The AI system should:
- identify what matters most now,
- rank priorities by urgency + neglect + user values,
- suggest missions and habits,
- surface mismatch between values and behavior,
- generate weekly focus areas,
- provide coaching messages,
- create opportunity insights for important relationships and goals.

The AI must be **hybrid**:
- deterministic scoring for core calculations
- LLM-generated narratives and recommendations for coaching / summaries

# 10.5 Meaningful Opportunity Insights
Priority’s signature feature is to estimate **meaningful opportunities remaining** based on user patterns.

Examples:
- projected visits with parents over 10 years
- weekly calls added if user changes habits
- possible shared routines with children
- relationship drift warnings

These must always be framed as:
- approximate
- based on current behavior
- reflective planning guidance, not certainty

Users must be able to disable mortality-style framing.

# 10.6 Missions
The app should use **missions**, not only tasks.

## Mission types
1. One-time meaningful action
2. Recurring ritual / habit
3. Goal milestone
4. Relationship maintenance mission
5. Recovery / repair mission (e.g. “schedule health checkup”)

Each mission includes:
- title
- description
- domain
- relationship (optional)
- due date
- recurrence
- priority score
- XP reward
- source (AI / user / system)

# 10.7 Habits
Users should be able to create or accept AI-suggested habits such as:
- call parents every Sunday
- walk 20 minutes daily
- weekly money review
- monthly friend catch-up
- date night twice a month
- journal 3 times a week

Habit system needs:
- recurrence
- completion tracking
- streaks
- XP rewards

# 10.8 Dashboard / Home
The home screen should show:
1. Today’s top mission
2. Current priority snapshot
3. Life domain cards
4. Meaningful insight card
5. Streak / XP summary
6. Today’s habits
7. Upcoming reminders
8. Quick journal CTA
9. Weekly progress summary

# 10.9 Journal / Reflection
Journal should support:
- daily mood
- gratitude
- “what mattered today?”
- “what did I avoid?”
- “what am I glad I didn’t postpone?”
- optional AI summary in weekly review

Journal data can improve recommendations.

# 10.10 Weekly Review
A weekly review is a major retention feature.

It should summarize:
- completed missions
- time/attention by domain
- neglected priorities
- streak performance
- relationship actions taken
- one “regret risk” to address next week
- next week’s top 3 focus areas
- AI-generated summary

# 10.11 Gamification
Gamification is core to retention.

## MVP gamification features
- XP
- streaks
- levels
- badges
- domain-specific XP
- milestone celebrations

Examples:
- Call parent → +25 Family XP
- Visit parents → +150 Family XP
- Finish workout → +20 Health XP
- Weekly review complete → +50 Wisdom XP

# 10.12 Notifications / Nudges
Priority should send:
- daily mission reminders
- streak reminders
- relationship nudges
- weekly review reminders
- health / finance / habit nudges
- “priority drift” alerts

Users must control:
- frequency
- time
- tone
- quiet hours

---

# 11. Success Metrics

## 11.1 Product KPIs
- onboarding completion rate
- Day 1 / Day 7 / Day 30 retention
- weekly active users
- mission completion rate
- weekly review completion rate
- average streak length
- % of users completing at least 1 relationship mission/week
- average number of meaningful actions per week

## 11.2 Outcome Metrics
- increase in family/relationship actions over time
- increase in health habit consistency
- reduction in neglected-domain score
- increase in self-reported alignment with priorities

---

# 12. Monetization Strategy

## Free Tier
- onboarding
- dashboard
- basic missions
- basic domain insights
- limited weekly review

## Premium Tier
- advanced AI coaching
- deeper opportunity insights
- unlimited AI mission planning
- advanced weekly review
- family planning features
- richer analytics
- smart relationship coaching

## Future Monetization
- family plans
- couples mode
- corporate wellbeing / employee life alignment
- premium coaching layer

---

# 13. Risks and Product Constraints

## Risks
1. Emotional insight without daily utility may cause churn.
2. Mortality framing may feel heavy if overused.
3. Overly generic recommendations will make the product feel like a normal habit app.
4. Too much complexity in onboarding may reduce conversion.

## Mitigations
- keep daily value high through missions + reminders + reviews
- allow users to control tone and intensity
- use progressive onboarding for advanced details
- personalize recommendations deeply

---

# 14. MVP Out of Scope (for first release)
- family shared workspace
- full couples mode
- advanced budgeting / bank integrations
- wearable integrations
- voice journaling
- AI chat coach with long memory
- social feed / community
- enterprise admin dashboard

---

# 15. Release Goal
The MVP should be strong enough to:
- demo to investors,
- onboard early users,
- validate retention around daily missions + weekly reviews,
- test willingness to pay for AI life coaching and relationship-focused insights.

---

# 16. Product Summary
Priority is not trying to help users do more.  
It is trying to help them do **what matters most**.

The product should feel like:
- an AI life coach,
- a meaning-aware planner,
- a regret-reduction system,
- and a motivating companion for living intentionally.

The app’s job is simple:

> **Take what the user says matters in life, compare it with what they actually do, and help close that gap every day.**
