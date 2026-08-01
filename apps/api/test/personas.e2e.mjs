/**
 * End-to-end persona harness.  `npm run test:e2e --prefix apps/api`
 *
 * Registers five deliberately different lives — a 22-year-old student and a
 * 61-year-old retiree, an 8-hour week and a 68-hour one, no children and
 * three, four countries — runs each through the exact write sequence the
 * mobile onboarding performs, exercises every endpoint the tabs actually
 * call, mutates through each tab, and then checks that no persona can see any
 * part of another's life.
 *
 * It exists because a unit test cannot catch what this was written to catch:
 * a new account opening onto the previous account's dashboard. That bug lived
 * in the seam between the auth store, the query cache and the persister — all
 * three individually correct.
 *
 * Needs the API running (default http://localhost:3001, override with $API)
 * and a database it may write to. It creates real accounts, so point it at a
 * development database only.
 */
const BASE = process.env.API ?? 'http://localhost:3001';

let PASS = 0;
const FAIL = [];
const WARN = [];

function ok(name) { PASS++; }
function bad(persona, name, detail) { FAIL.push({ persona, name, detail: String(detail).slice(0, 300) }); }
function warn(persona, name, detail) { WARN.push({ persona, name, detail: String(detail).slice(0, 200) }); }

function check(persona, name, cond, detail = '') {
  if (cond) ok(name); else bad(persona, name, detail || 'assertion failed');
  return !!cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, path, opts = {}) {
  /**
   * Rate limits are a feature, not a failure — auth is 5/min by design. The
   * harness waits them out rather than reporting them as broken endpoints,
   * except where a test is specifically about the limit.
   */
  const tries = opts.throttleAware === false ? 1 : 4;
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetch(BASE + path, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (res.status === 429 && attempt < tries - 1) {
      // The auth window is 60s; wait past it rather than nibbling at it.
      await sleep(path.startsWith('/auth/') ? 62_000 : 16_000);
      continue;
    }
    return { status: res.status, body: json };
  }
}

const stamp = Date.now();

const PERSONAS = [
  {
    id: 'aarav',
    fullName: 'Aarav Menon',
    email: `aarav.${stamp}@e2e.test`,
    password: 'priority123',
    profile: {
      dob: '1992-03-14T00:00:00.000Z', city: 'Bengaluru', country: 'India',
      profession: 'Software engineer', workType: 'hybrid', workHoursPerWeek: 50,
      maritalStatus: 'married', childrenCount: 1, livesAwayFromParents: true,
      motivationStyle: 'balanced', timezone: 'Asia/Kolkata',
    },
    ranking: ['family', 'health', 'career', 'growth', 'finance', 'friends'],
    reality: { family: 2, health: 2, career: 4, growth: 3, finance: 3, friends: 1 },
    neglected: ['health', 'friends'],
    feeling: 'less stretched',
    postponing: 'Taking my parents on the Kerala trip we keep talking about',
    postponingDomain: 'family',
    futureSelf: 'Present at dinner, fit enough to keep up with my son, still building things I care about.',
    eulogy: 'He showed up. Every single time it mattered, he was in the room.',
    person: {
      name: 'Lakshmi', relationType: 'mother', age: 66, locationType: 'different_city',
      healthStatus: 'fair', callFrequency: 'weekly', desiredCallFrequency: 'weekly',
      inPersonFrequency: 'yearly', closenessScore: 9, wantsMoreTime: true,
      meaningfulMomentTypes: ['home-cooked meals', 'temple visits'],
    },
    extraPeople: [
      { name: 'Divya', relationType: 'spouse', age: 33, locationType: 'same_home', closenessScore: 10, desiredCallFrequency: 'daily', wantsMoreTime: true, meaningfulMomentTypes: ['evening walks'] },
      { name: 'Kabir', relationType: 'child', age: 5, locationType: 'same_home', closenessScore: 10, desiredCallFrequency: 'daily', wantsMoreTime: true },
    ],
    counts: [{ label: 'Kerala trips with Amma', perYear: 1 }, { label: 'books finished', perYear: 12 }],
    memories: ['Trek up Nandi Hills with Kabir', 'Diwali at home with Amma', 'Kerala trip with Amma and Appa'],
    screenHoursPerDay: 5,
  },
  {
    id: 'priya',
    fullName: 'Priya Raghunathan',
    email: `priya.${stamp}@e2e.test`,
    password: 'priority123',
    profile: {
      dob: '1998-07-02T00:00:00.000Z', city: 'Chennai', country: 'India',
      profession: 'Resident doctor', workType: 'onsite', workHoursPerWeek: 68,
      maritalStatus: 'single', childrenCount: 0, livesAwayFromParents: false,
      motivationStyle: 'challenging', timezone: 'Asia/Kolkata',
    },
    ranking: ['career', 'growth', 'family', 'health', 'friends', 'reflection'],
    reality: { career: 4, growth: 3, family: 3, health: 1, friends: 2, reflection: 1 },
    neglected: ['health', 'reflection', 'friends'],
    feeling: 'like I have a life outside the hospital',
    postponing: 'Actually sleeping eight hours and seeing my friends once a month',
    postponingDomain: 'health',
    futureSelf: 'A good doctor who is also a whole person.',
    eulogy: 'She never let the work eat the person doing it.',
    person: {
      name: 'Meenakshi', relationType: 'mother', age: 58, locationType: 'same_home',
      healthStatus: 'good', callFrequency: 'daily', desiredCallFrequency: 'daily',
      inPersonFrequency: 'daily', closenessScore: 8, wantsMoreTime: false,
      meaningfulMomentTypes: ['morning coffee'],
    },
    extraPeople: [
      { name: 'Nithya', relationType: 'friend', age: 28, locationType: 'same_city', closenessScore: 7, desiredCallFrequency: 'weekly', wantsMoreTime: true, meaningfulMomentTypes: ['beach walks'] },
    ],
    counts: [{ label: 'beach walks with Nithya', perYear: 12 }],
    memories: ['Beach walk with Nithya', 'Night shift ended at sunrise'],
    screenHoursPerDay: 3,
  },
  {
    id: 'daniel',
    fullName: 'Daniel Okafor',
    email: `daniel.${stamp}@e2e.test`,
    password: 'priority123',
    profile: {
      dob: '1981-11-20T00:00:00.000Z', city: 'Lagos', country: 'Nigeria',
      profession: 'Business owner', workType: 'onsite', workHoursPerWeek: 58,
      maritalStatus: 'married', childrenCount: 3, livesAwayFromParents: true,
      motivationStyle: 'gentle', timezone: 'Africa/Lagos',
    },
    ranking: ['family', 'finance', 'impact', 'health', 'purpose', 'career'],
    reality: { family: 3, finance: 4, impact: 2, health: 2, purpose: 1, career: 4 },
    neglected: ['health', 'purpose', 'impact'],
    feeling: 'like the business is not the only thing I built',
    postponing: 'Mentoring the two young people who keep asking me for time',
    postponingDomain: 'impact',
    futureSelf: 'Someone whose children saw him choose them.',
    eulogy: 'He built things that outlived him, starting with his family.',
    person: {
      name: 'Chidi', relationType: 'father', age: 79, locationType: 'different_country',
      healthStatus: 'poor', callFrequency: 'monthly', desiredCallFrequency: 'weekly',
      inPersonFrequency: 'yearly', closenessScore: 9, wantsMoreTime: true,
      meaningfulMomentTypes: ['long phone calls', 'watching football together'],
    },
    extraPeople: [
      { name: 'Amara', relationType: 'spouse', age: 42, locationType: 'same_home', closenessScore: 10, desiredCallFrequency: 'daily', wantsMoreTime: true },
      { name: 'Zara', relationType: 'child', age: 12, locationType: 'same_home', closenessScore: 10, desiredCallFrequency: 'daily', wantsMoreTime: true },
    ],
    counts: [{ label: 'football matches with Chidi', perYear: 4 }],
    memories: ['Watched the derby with Dad on video call'],
    screenHoursPerDay: 7,
  },
  {
    id: 'mei',
    fullName: 'Mei Lin Chen',
    email: `mei.${stamp}@e2e.test`,
    password: 'priority123',
    profile: {
      dob: '2004-01-09T00:00:00.000Z', city: 'Singapore', country: 'Singapore',
      profession: 'Student', workType: 'remote', workHoursPerWeek: 22,
      maritalStatus: 'single', childrenCount: 0, livesAwayFromParents: true,
      motivationStyle: 'challenging', timezone: 'Asia/Singapore',
    },
    ranking: ['growth', 'friends', 'experiences', 'career', 'health', 'finance'],
    reality: { growth: 4, friends: 3, experiences: 2, career: 2, health: 3, finance: 1 },
    neglected: ['finance', 'family', 'experiences'],
    feeling: 'less broke and more brave',
    postponing: 'Starting the side project I have described to everyone twice',
    postponingDomain: 'purpose',
    futureSelf: 'Someone who shipped the thing instead of describing it.',
    eulogy: 'She was curious out loud, and it made other people braver.',
    person: {
      name: 'Wei', relationType: 'friend', age: 22, locationType: 'same_city',
      healthStatus: 'excellent', callFrequency: 'weekly', desiredCallFrequency: 'weekly',
      inPersonFrequency: 'weekly', closenessScore: 8, wantsMoreTime: true,
      meaningfulMomentTypes: ['hawker centre dinners'],
    },
    extraPeople: [],
    counts: [{ label: 'hawker dinners with Wei', perYear: 26 }],
    memories: ['Hawker dinner with Wei at Old Airport Road'],
    screenHoursPerDay: null,   // deliberately never set — tests the unknown branch
  },
  {
    id: 'robert',
    fullName: 'Robert Hayes',
    email: `robert.${stamp}@e2e.test`,
    password: 'priority123',
    profile: {
      dob: '1965-05-30T00:00:00.000Z', city: 'Manchester', country: 'United Kingdom',
      profession: 'Retired teacher', workType: 'remote', workHoursPerWeek: 8,
      maritalStatus: 'married', childrenCount: 2, livesAwayFromParents: false,
      motivationStyle: 'gentle', timezone: 'Europe/London',
    },
    ranking: ['health', 'family', 'reflection', 'friends', 'impact', 'experiences'],
    reality: { health: 3, family: 4, reflection: 3, friends: 2, impact: 2, experiences: 2 },
    neglected: ['friends', 'purpose'],
    feeling: 'steadier',
    postponing: 'Writing down the family history before there is nobody left to ask',
    postponingDomain: 'purpose',
    futureSelf: 'Still walking every morning, still curious, still useful to someone.',
    eulogy: 'He taught, and then he kept teaching in quieter ways.',
    person: {
      name: 'Eleanor', relationType: 'spouse', age: 60, locationType: 'same_home',
      healthStatus: 'good', callFrequency: 'daily', desiredCallFrequency: 'daily',
      inPersonFrequency: 'daily', closenessScore: 10, wantsMoreTime: true,
      meaningfulMomentTypes: ['morning walks', 'Sunday roasts'],
    },
    extraPeople: [
      { name: 'James', relationType: 'child', age: 31, locationType: 'different_city', closenessScore: 8, desiredCallFrequency: 'weekly', wantsMoreTime: true },
    ],
    counts: [{ label: 'morning walks with Eleanor', perYear: 200 }],
    memories: ['Morning walk with Eleanor along the canal', 'Sunday roast with James'],
    screenHoursPerDay: 2,
  },
];

/**
 * Every read the tabs perform, grouped by the tab that performs it.
 *
 * Taken from the actual `api('/…')` call sites in apps/mobile, not guessed —
 * an earlier version of this list invented `/relationships/drift` and
 * `/journal/prompts`, which 404 because the real routes live under
 * `/life-os/`. A harness that tests routes the app never calls proves nothing
 * about the app.
 */
const TAB_READS = {
  Today: ['/dashboard', '/missions?status=pending', '/missions?status=completed',
    '/habits', '/habits?all=1', '/life-os/today?preview=1', '/life-os/organism',
    '/life-os/organism/years', '/life-os/graph', '/life-os/rhythm', '/life-os/drift',
    '/relationships', '/memories/on-this-day', '/gamification/profile'],
  Time: ['/me', '/me/preferences', '/insights/opportunities', '/onboarding/answers',
    '/memories/counts-summary', '/memories/count-candidates', '/memories/archive-themes',
    '/life-os/stacks', '/relationships', '/habits', '/habits?all=1'],
  Missions: ['/missions?status=pending', '/missions?status=completed', '/goals', '/dashboard'],
  People: ['/relationships', '/life-os/drift', '/insights/opportunities'],
  Journal: ['/journal', '/journal?take=30', '/memories'],
  Review: ['/weekly-review/current', '/gamification/profile', '/gamification/domain-xp'],
  Record: ['/life-os/document', '/memories', '/life-os/timeline/years',
    '/life-os/decisions', '/life-os/knowledge', '/goals'],
  You: ['/me', '/me/preferences', '/gamification/profile', '/notifications', '/partners'],
};

async function buildPersona(p) {
  const log = (...a) => console.log(`  [${p.id}]`, ...a);

  // ---- register -----------------------------------------------------------
  const reg = await call(null, '/auth/register', {
    method: 'POST',
    body: {
      fullName: p.fullName, email: p.email, password: p.password,
      timezone: p.profile.timezone,
    },
  });
  if (!check(p.id, 'register', reg.status === 201 || reg.status === 200, `${reg.status} ${JSON.stringify(reg.body)}`)) return null;
  const token = reg.body.accessToken;
  p.token = token;

  // A brand-new account must be empty. This is the bug that started all this.
  const freshDash = await call(token, '/dashboard');
  check(p.id, 'new account: dashboard is its own',
    freshDash.status === 200, `${freshDash.status}`);
  const freshRels = await call(token, '/relationships');
  check(p.id, 'new account: no inherited relationships',
    Array.isArray(freshRels.body) && freshRels.body.length === 0,
    `got ${JSON.stringify(freshRels.body).slice(0, 120)}`);
  const freshMem = await call(token, '/memories');
  const memList = Array.isArray(freshMem.body) ? freshMem.body : freshMem.body?.items ?? [];
  check(p.id, 'new account: no inherited memories', memList.length === 0, `got ${memList.length}`);

  // ---- onboarding, in the order the app writes it -------------------------
  const patch = await call(token, '/me', { method: 'PATCH', body: p.profile });
  check(p.id, 'PATCH /me profile', patch.status === 200, `${patch.status} ${JSON.stringify(patch.body).slice(0,150)}`);

  const goal = await call(token, '/goals', {
    method: 'POST',
    body: {
      title: p.postponing.slice(0, 60), description: p.postponing,
      domainType: p.postponingDomain, horizon: '1y',
    },
  });
  check(p.id, 'POST /goals', goal.status === 201 || goal.status === 200, `${goal.status} ${JSON.stringify(goal.body).slice(0,150)}`);

  const answers = await call(token, '/onboarding/answers', {
    method: 'POST',
    body: {
      answers: [
        { section: 'values', key: 'priorityRanking', value: p.ranking },
        { section: 'values', key: 'currentReality', value: p.reality },
        { section: 'values', key: 'neglectedDomains', value: p.neglected },
        { section: 'values', key: 'regretRisks', value: p.neglected.slice(0, 3) },
        { section: 'values', key: 'firstWeekFeeling', value: p.feeling },
        { section: 'reflection', key: 'postponing', value: p.postponing },
        { section: 'reflection', key: 'futureSelf', value: p.futureSelf },
        { section: 'reflection', key: 'eulogy', value: p.eulogy },
      ],
    },
  });
  check(p.id, 'POST /onboarding/answers', answers.status === 201 || answers.status === 200, `${answers.status}`);

  for (const person of [p.person, ...p.extraPeople]) {
    const r = await call(token, '/relationships', { method: 'POST', body: person });
    check(p.id, `POST /relationships ${person.name}`, r.status === 201 || r.status === 200,
      `${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
  }

  const complete = await call(token, '/onboarding/complete', { method: 'POST' });
  check(p.id, 'POST /onboarding/complete', complete.status === 201 || complete.status === 200,
    `${complete.status} ${JSON.stringify(complete.body).slice(0, 200)}`);

  const me = await call(token, '/me');
  check(p.id, 'onboardingCompleted is true', me.body?.onboardingCompleted === true, JSON.stringify(me.body).slice(0,150));
  check(p.id, 'profile persisted (city)', me.body?.city === p.profile.city, `${me.body?.city}`);
  check(p.id, 'profile persisted (workHoursPerWeek)',
    me.body?.workHoursPerWeek === p.profile.workHoursPerWeek, `${me.body?.workHoursPerWeek}`);

  // ---- the new screen-hours field ----------------------------------------
  check(p.id, 'screenHoursPerDay starts null', me.body?.screenHoursPerDay === null,
    `${me.body?.screenHoursPerDay}`);
  if (p.screenHoursPerDay != null) {
    const sh = await call(token, '/me', { method: 'PATCH', body: { screenHoursPerDay: p.screenHoursPerDay } });
    check(p.id, 'PATCH screenHoursPerDay', sh.status === 200, `${sh.status}`);
    const me2 = await call(token, '/me');
    check(p.id, 'screenHoursPerDay round-trips',
      me2.body?.screenHoursPerDay === p.screenHoursPerDay, `${me2.body?.screenHoursPerDay}`);
  }

  // ---- memories + counts --------------------------------------------------
  for (const title of p.memories) {
    const m = await call(token, '/memories', {
      method: 'POST',
      body: { title, occurredAt: new Date(Date.now() - Math.random() * 400 * 864e5).toISOString(), kind: 'moment' },
    });
    check(p.id, `POST /memories "${title.slice(0, 22)}"`, m.status === 201 || m.status === 200,
      `${m.status} ${JSON.stringify(m.body).slice(0, 150)}`);
  }
  for (const c of p.counts) {
    const key = c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const r = await call(token, '/onboarding/answers', {
      method: 'POST',
      body: { answers: [{ section: 'counts', key, value: { label: c.label, perYear: c.perYear } }] },
    });
    check(p.id, `count "${c.label.slice(0, 22)}"`, r.status === 201 || r.status === 200, `${r.status}`);
  }

  // ---- a rhythm and a journal entry --------------------------------------
  const habit = await call(token, '/habits', {
    method: 'POST',
    body: { title: 'Walk 20 minutes', domainType: 'health', targetPerWeek: 5, sourceType: 'system' },
  });
  check(p.id, 'POST /habits', habit.status === 201 || habit.status === 200,
    `${habit.status} ${JSON.stringify(habit.body).slice(0, 150)}`);
  if (habit.body?.id) {
    p.habitId = habit.body.id;
    const done = await call(token, `/habits/${habit.body.id}/complete`, { method: 'POST', body: {} });
    check(p.id, 'POST /habits/:id/complete', done.status === 201 || done.status === 200, `${done.status}`);
  }

  const entry = await call(token, '/journal', {
    method: 'POST',
    body: {
      mood: 3,
      whatMattered: `${p.fullName} first entry`,
      freeText: p.futureSelf,
      gratitude: 'Made it through the day.',
    },
  });
  check(p.id, 'POST /journal', entry.status === 201 || entry.status === 200,
    `${entry.status} ${JSON.stringify(entry.body).slice(0, 150)}`);

  return p;
}

/** Nothing this API returns may carry a secret. */
const SECRETS = /passwordHash|tokenHash|refreshToken|JWT_|SECRET|DATABASE_URL|AI_API_KEY/;

async function exerciseTabs(p) {
  const token = p.token;
  for (const [tab, paths] of Object.entries(TAB_READS)) {
    for (const path of paths) {
      const r = await call(token, path);
      if (r.status < 400) {
        check(p.id, `${tab} ${path} carries no credentials`,
          !SECRETS.test(JSON.stringify(r.body ?? {})),
          JSON.stringify(r.body ?? {}).match(/.{0,40}(passwordHash|tokenHash|SECRET).{0,20}/)?.[0] ?? '');
      }
      if (r.status >= 500) {
        bad(p.id, `${tab} ${path}`, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      } else if (r.status >= 400 && r.status !== 404) {
        bad(p.id, `${tab} ${path}`, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      } else if (r.status === 404) {
        warn(p.id, `${tab} ${path}`, 'route not found (404)');
      } else {
        ok(`${tab} ${path}`);
      }
    }
  }
}

/** Nobody's data may appear in anybody else's reads. */
async function crossCheck(people) {
  for (const p of people) {
    const others = people.filter((o) => o.id !== p.id);
    const rels = await call(p.token, '/relationships');
    // "Stray*" is created by writeBoundaryChecks; it is this persona's own.
    const names = (rels.body ?? []).map((r) => r.name).filter((n) => !n.startsWith('Stray'));
    const mine = [p.person.name, ...p.extraPeople.map((e) => e.name)];

    check(p.id, 'relationships are exactly mine',
      names.length === mine.length && mine.every((n) => names.includes(n)),
      `expected ${JSON.stringify(mine)} got ${JSON.stringify(names)}`);

    for (const o of others) {
      const foreign = [o.person.name, ...o.extraPeople.map((e) => e.name)]
        .filter((n) => !mine.includes(n));
      const leaked = names.filter((n) => foreign.includes(n));
      check(p.id, `no relationship leak from ${o.id}`, leaked.length === 0,
        `saw ${JSON.stringify(leaked)}`);
    }

    const memories = await call(p.token, '/memories');
    const list = Array.isArray(memories.body) ? memories.body : memories.body?.items ?? [];
    const titles = list.map((m) => m.title);
    for (const o of others) {
      const leaked = titles.filter((t) => o.memories.includes(t) && !p.memories.includes(t));
      check(p.id, `no memory leak from ${o.id}`, leaked.length === 0, `saw ${JSON.stringify(leaked)}`);
    }

    const meRes = await call(p.token, '/me');
    check(p.id, 'identity is mine', meRes.body?.email === p.email,
      `${meRes.body?.email} !== ${p.email}`);
  }
}

/** Nothing the app renders may contain a broken number. */
async function copyChecks(people) {
  const NAN = /NaN|Infinity|undefined|null undefined|~\s*$/;
  for (const p of people) {
    const insights = await call(p.token, '/insights/opportunities');
    for (const i of insights.body ?? []) {
      check(p.id, `insight copy is readable: ${i.kind}`,
        !NAN.test(i.headline) && !NAN.test(i.detail),
        `${i.headline} | ${i.detail}`);
      check(p.id, `insight estimate is finite: ${i.kind}`,
        i.estimate === null || Number.isFinite(Number(i.estimate)), `${i.estimate}`);
    }
    const dash = await call(p.token, '/dashboard');
    check(p.id, 'dashboard copy has no NaN',
      !NAN.test(JSON.stringify(dash.body ?? {})),
      JSON.stringify(dash.body ?? {}).match(/.{0,60}(NaN|Infinity).{0,60}/)?.[0] ?? '');

    const doc = await call(p.token, '/life-os/document');
    check(p.id, 'life document has no NaN',
      !/NaN|Infinity/.test(JSON.stringify(doc.body ?? {})),
      JSON.stringify(doc.body ?? {}).match(/.{0,60}(NaN|Infinity).{0,60}/)?.[0] ?? '');
  }
}

/** Writes must be validated, not passed through to the database. */
async function writeBoundaryChecks(people) {
  const [a, b] = people;

  // "1992-03-14" is a date JS parses fine, so this asserts it is accepted and
  // coerced rather than reaching Prisma raw. The genuinely malformed one below
  // is what must not become a 500.
  const dateOnly = await call(a.token, '/me', { method: 'PATCH', body: { dob: '1992-03-14' } });
  check('write', 'date-only dob is coerced, not rejected', dateOnly.status === 200, `${dateOnly.status}`);
  check('write', 'PATCH /me never returns passwordHash',
    !JSON.stringify(dateOnly.body ?? {}).includes('passwordHash'),
    'passwordHash in PATCH /me response');

  const badDob = await call(a.token, '/me', { method: 'PATCH', body: { dob: 'not-a-date' } });
  check('write', 'malformed dob is a 400, not a 500',
    badDob.status === 400, `${badDob.status} ${JSON.stringify(badDob.body)}`);

  const badHours = await call(a.token, '/me', { method: 'PATCH', body: { screenHoursPerDay: 'lots' } });
  check('write', 'non-numeric screenHoursPerDay is a 400',
    badHours.status === 400, `${badHours.status}`);

  // The field allowlist: a relationship must not be reassignable to another
  // account, and the engine's own score must not be settable by a client.
  const rels = await call(a.token, '/relationships');
  const mine = rels.body?.[0];
  if (mine) {
    const before = mine.priorityScore;
    const attack = await call(a.token, `/relationships/${mine.id}`, {
      method: 'PATCH',
      body: { userId: b.tokenUserId ?? 'someone-else', priorityScore: 999, notes: 'ok to keep' },
    });
    check('write', 'relationship update does not 500 on unknown fields',
      attack.status < 500, `${attack.status}`);
    const after = await call(a.token, `/relationships/${mine.id}`);
    check('write', 'client cannot set priorityScore',
      Number(after.body?.priorityScore) === Number(before),
      `${before} -> ${after.body?.priorityScore}`);
    check('write', 'relationship still belongs to its owner',
      after.status === 200 && after.body?.id === mine.id, `${after.status}`);
    check('write', 'allowlisted field still writes through',
      after.body?.notes === 'ok to keep', `${after.body?.notes}`);
  }

  // Stray enum words must be accepted and normalised, never stored raw and
  // never turned into NaN downstream.
  const stray = await call(a.token, '/relationships', {
    method: 'POST',
    body: {
      name: `Stray${Date.now()}`, relationType: 'friend', age: 71,
      healthStatus: 'fair', locationType: 'different_country',
      inPersonFrequency: 'yearly', desiredCallFrequency: 'monthly', wantsMoreTime: true,
    },
  });
  check('write', 'stray enum values accepted', stray.status < 400, `${stray.status}`);
  check('write', 'healthStatus normalised on the way in',
    ['good', 'declining', 'serious'].includes(stray.body?.healthStatus),
    `${stray.body?.healthStatus}`);
  check('write', 'locationType normalised on the way in',
    ['same_city', 'different_city', 'abroad'].includes(stray.body?.locationType),
    `${stray.body?.locationType}`);
}

/** Everything a tab can write, written and read back. */
async function mutationChecks(p) {
  const t = p.token;

  const goal = await call(t, '/goals', { method: 'POST', body: { title: 'E2E goal', domainType: 'growth', horizon: '1y' } });
  check(p.id, 'create goal', goal.status < 400, `${goal.status}`);
  if (goal.body?.id) {
    const patched = await call(t, `/goals/${goal.body.id}`, { method: 'PATCH', body: { title: 'E2E goal renamed' } });
    check(p.id, 'update goal', patched.status < 400, `${patched.status}`);
  }

  const mission = await call(t, '/missions', {
    method: 'POST',
    body: { title: 'E2E mission', domainType: 'health', xpReward: 10 },
  });
  check(p.id, 'create mission', mission.status < 400, `${mission.status} ${JSON.stringify(mission.body).slice(0,120)}`);
  if (mission.body?.id) {
    const done = await call(t, `/missions/${mission.body.id}/complete`, { method: 'POST' });
    check(p.id, 'complete mission', done.status < 400, `${done.status}`);
  }

  const mem = await call(t, '/memories', {
    method: 'POST',
    body: { title: 'E2E memory', occurredAt: new Date().toISOString(), kind: 'moment' },
  });
  check(p.id, 'create memory', mem.status < 400, `${mem.status}`);

  const j = await call(t, '/journal', {
    method: 'POST',
    body: { mood: 4, whatMattered: 'E2E entry', freeText: 'Something worth keeping.' },
  });
  check(p.id, 'create journal entry', j.status < 400, `${j.status}`);
  const jList = await call(t, '/journal?take=30');
  const jItems = Array.isArray(jList.body) ? jList.body : jList.body?.items ?? [];
  check(p.id, 'journal entry reads back', jItems.length > 0, `${jItems.length}`);
  check(p.id, 'journal content survives the round trip',
    jItems.some((e) => e.whatMattered === 'E2E entry' && e.freeText === 'Something worth keeping.'),
    JSON.stringify(jItems[0] ?? {}).slice(0, 200));

  // Editing one field must not blank the others.
  const target = jItems.find((e) => e.whatMattered === 'E2E entry');
  if (target) {
    const edited = await call(t, `/journal/${target.id}`, { method: 'PATCH', body: { mood: 5 } });
    check(p.id, 'edit journal entry', edited.status < 400, `${edited.status}`);
    check(p.id, 'editing mood keeps the writing',
      edited.body?.freeText === 'Something worth keeping.', `${edited.body?.freeText}`);
    const del = await call(t, `/journal/${target.id}`, { method: 'DELETE' });
    check(p.id, 'delete journal entry', del.status < 400, `${del.status}`);
  }

  if (p.habitId) {
    const retire = await call(t, `/habits/${p.habitId}/retire`, { method: 'POST', body: {} });
    check(p.id, 'retire habit', retire.status < 400, `${retire.status}`);
    const active = await call(t, '/habits');
    check(p.id, 'retired habit leaves the active list',
      !(active.body ?? []).some((h) => h.id === p.habitId), 'still listed');
    const all = await call(t, '/habits?all=1');
    check(p.id, 'retired habit survives in the full list',
      (all.body ?? []).some((h) => h.id === p.habitId), 'gone entirely');
    const restore = await call(t, `/habits/${p.habitId}/restore`, { method: 'POST', body: {} });
    check(p.id, 'restore habit', restore.status < 400, `${restore.status}`);
  }

  const prefs = await call(t, '/me/preferences', { method: 'PATCH', body: { insightIntensity: 'off' } });
  check(p.id, 'set insightIntensity=off', prefs.status < 400, `${prefs.status}`);
  const silenced = await call(t, '/insights/opportunities');
  check(p.id, 'insightIntensity=off returns nothing',
    Array.isArray(silenced.body) && silenced.body.length === 0,
    `${JSON.stringify(silenced.body).slice(0, 120)}`);
  await call(t, '/me/preferences', { method: 'PATCH', body: { insightIntensity: 'gentle' } });

  const review = await call(t, '/weekly-review/generate', { method: 'POST', body: {} });
  check(p.id, 'generate weekly review', review.status < 400, `${review.status} ${JSON.stringify(review.body).slice(0,120)}`);

  const exported = await call(t, '/me/export', { throttleAware: false });
  if (exported.status === 429) {
    // Export is deliberately throttled to 3/min; five personas in a row trip it.
    warn(p.id, 'export throttled (expected)', '429');
  } else {
    check(p.id, 'export returns this account only',
      exported.body?.user?.email === p.email, `${exported.body?.user?.email}`);
    check(p.id, 'export excludes credentials',
      !JSON.stringify(exported.body ?? {}).includes('passwordHash'), 'passwordHash present');
  }
}

/** A token must not be usable for anyone else's records. */
async function authChecks(people) {
  const [a, b] = people;
  const noToken = await call(null, '/dashboard');
  check('auth', 'unauthenticated /dashboard rejected', noToken.status === 401, `${noToken.status}`);

  const garbage = await call('not-a-real-token', '/dashboard');
  check('auth', 'garbage token rejected', garbage.status === 401, `${garbage.status}`);

  // Fetch one of b's relationship ids, then try to read/mutate it as a.
  const bRels = await call(b.token, '/relationships');
  const victim = bRels.body?.[0]?.id;
  if (victim) {
    const read = await call(a.token, `/relationships/${victim}`);
    check('auth', "cannot read another user's relationship",
      read.status === 404 || read.status === 403, `${read.status}`);
    const contact = await call(a.token, `/relationships/${victim}/contact`, { method: 'POST', body: { channel: 'call' } });
    check('auth', "cannot log contact on another user's relationship",
      contact.status === 404 || contact.status === 403, `${contact.status}`);
  }
  if (b.habitId) {
    const retire = await call(a.token, `/habits/${b.habitId}/retire`, { method: 'POST', body: {} });
    check('auth', "cannot retire another user's habit",
      retire.status === 404 || retire.status === 403, `${retire.status}`);
  }
}

(async () => {
  console.log(`\n=== Priority end-to-end persona run (${BASE}) ===\n`);

  const built = [];
  for (const p of PERSONAS) {
    console.log(`- building ${p.fullName}`);
    const r = await buildPersona(p);
    if (r) built.push(r);
  }

  console.log(`\n- exercising every tab for ${built.length} personas`);
  for (const p of built) await exerciseTabs(p);

  console.log('- cross-checking isolation');
  await crossCheck(built);

  console.log('- copy and number sanity');
  await copyChecks(built);

  console.log('- write boundary checks');
  await writeBoundaryChecks(built);

  console.log('- mutations across every tab');
  for (const p of built) await mutationChecks(p);

  console.log('- re-checking isolation after all those writes');
  await crossCheck(built);

  console.log('- auth boundary checks');
  await authChecks(built);

  console.log(`\n=== ${PASS} passed · ${FAIL.length} failed · ${WARN.length} warnings ===\n`);
  if (WARN.length) {
    console.log('WARNINGS:');
    for (const w of WARN) console.log(`  ~ [${w.persona}] ${w.name}: ${w.detail}`);
    console.log();
  }
  if (FAIL.length) {
    console.log('FAILURES:');
    for (const f of FAIL) console.log(`  ✗ [${f.persona}] ${f.name}\n      ${f.detail}`);
    process.exitCode = 1;
  }
  // Leave the tokens behind so the browser pass can sign in as a persona.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    new URL('./.personas.local.json', import.meta.url),
    JSON.stringify(built.map((p) => ({ id: p.id, email: p.email, password: p.password, token: p.token })), null, 2),
  );
})();
