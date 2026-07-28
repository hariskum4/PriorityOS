import { describe, it, expect } from 'vitest';
import { classifyCapture, KnownPerson } from './capture';

const people: KnownPerson[] = [
  { id: 'amma', name: 'Amma', relationType: 'mother' },
  { id: 'priya', name: 'Priya', relationType: 'spouse' },
  { id: 'sam', name: 'Sam Kelleher', relationType: 'friend' },
  { id: 'anna', name: 'Annapurna', relationType: 'friend' },
];

const go = (transcript: string, kindHint?: any) =>
  classifyCapture({ transcript, people, kindHint });

describe('who it was about', () => {
  it('matches a known person by the name people actually say', () => {
    const r = go('Just called Amma, she sounded better today.');
    expect(r.peopleIds).toEqual(['amma']);
    expect(r.peopleNames).toEqual(['Amma']);
  });

  it('matches on first name when the record holds a full name', () => {
    const r = go('Long walk with Sam this evening.');
    expect(r.peopleIds).toEqual(['sam']);
  });

  it('does not let a short name steal a match inside a longer one', () => {
    // "Anna" must not match inside "Annapurna" and vice versa.
    const r = go('Annapurna dropped by with sweets.');
    expect(r.peopleIds).toEqual(['anna']);
  });

  it('returns people in the order they were spoken about', () => {
    const r = go('Priya and I both called Amma after dinner.');
    expect(r.peopleIds).toEqual(['priya', 'amma']);
  });

  it('finds no one when no one is named', () => {
    const r = go('Felt scattered all afternoon and got nothing done.');
    expect(r.peopleIds).toEqual([]);
  });
});

describe('what kind of act it was', () => {
  it('reads a call', () => {
    expect(go('Called Amma about the hospital appointment.').kind).toBe('call');
  });

  it('reads a visit', () => {
    expect(go('Went to see Priya at her office.').kind).toBe('visit');
  });

  it('reads a message', () => {
    expect(go('Texted Sam a photo from the trip.').kind).toBe('message');
  });

  it('prefers meeting over call — "called into the meeting" is a meeting', () => {
    expect(go('Called into the sprint review, it overran again.').kind).toBe('meeting');
  });

  it('reads something worth keeping as a moment', () => {
    expect(go('First time Maya rode her bike without help.').kind).toBe('moment');
  });

  it('files a note about a person with no verb as contact, not reflection', () => {
    expect(go('Amma. The garden is doing well apparently.').kind).toBe('call');
  });

  it('files a note about no one as a reflection', () => {
    expect(go('I keep putting off the dentist and I know why.').kind).toBe('reflection');
  });

  it('trusts an explicit hint from the UI over its own guess', () => {
    const r = go('Amma, quick chat.', 'visit');
    expect(r.kind).toBe('visit');
    expect(r.because.join(' ')).toMatch(/you said this was a visit/);
  });
});

describe('which part of life', () => {
  it('a named person outranks any other signal', () => {
    // Mentions work words, but it is about his mother.
    const r = go('Called Amma between two client meetings about the deadline.');
    expect(r.domain).toBe('relationships');
  });

  it('reads health from unambiguous words', () => {
    expect(go('Ran five kilometres, slept badly again.').domain).toBe('health');
  });

  it('reads finances', () => {
    expect(go('Moved the tax savings across before the deadline.').domain).toBe('finances');
  });

  it('reads growth', () => {
    expect(go('Read forty pages and practised for an hour.').domain).toBe('growth');
  });

  it('files a meeting with nobody known under career', () => {
    const r = go('Standup ran long, nothing decided.');
    expect(r.domain).toBe('career');
  });

  it('leaves the domain unset rather than guessing', () => {
    const r = go('Something felt off but I cannot name it.');
    expect(r.domain).toBeNull();
    expect(r.confident).toBe(false);
  });
});

describe('title and body', () => {
  it('takes the first sentence as the title', () => {
    const r = go('Called Amma. She wants us to visit in October. I said maybe.');
    expect(r.title).toBe('Called Amma');
  });

  it('keeps the whole transcript, always', () => {
    const long = 'Called Amma. She wants us to visit in October. I said maybe.';
    expect(go(long).body).toBe(long);
  });

  it('clips a long single sentence on a word boundary', () => {
    const r = go(
      'Had a really long and quite circular conversation with Sam about whether any of '
      + 'this is worth doing at all which went nowhere',
    );
    expect(r.title.length).toBeLessThanOrEqual(71);
    expect(r.title.endsWith('…')).toBe(true);
    expect(r.title.replace(/…$/, '')).toMatch(/\S$/);   // never mid-word
  });

  it('survives an empty transcript without throwing', () => {
    const r = classifyCapture({ transcript: '', people });
    expect(r.title).toBe('');
    expect(r.confident).toBe(false);
  });
});

describe('it explains itself', () => {
  it('always says why it filed the note where it did', () => {
    const r = go('Called Amma about the garden.');
    expect(r.because.length).toBeGreaterThan(0);
    expect(r.because.join(' ')).toMatch(/mentions Amma/);
  });

  it('admits when it is not sure, so the UI can ask', () => {
    expect(go('Hmm.').confident).toBe(false);
    expect(go('Called Amma.').confident).toBe(true);
  });
});

describe('regressions worth keeping', () => {
  it('does not read "ran long" as going for a run', () => {
    // A bare `ran` in the health list filed "the standup ran long" under health.
    expect(go('The standup ran long and we ran out of time.').domain).toBe('career');
  });

  it('lets the strongest signal win, not the first one listed', () => {
    // First-match-wins made list order into precedence: one career word beat
    // two finance words.
    expect(go('Moved the tax savings across before the deadline.').domain).toBe('finances');
  });

  it('is stable across repeated calls', () => {
    // Global regexes sharing lastIndex return different answers the second time.
    const line = 'Ran five kilometres, slept badly again.';
    expect(go(line).domain).toBe(go(line).domain);
    expect(go(line).domain).toBe('health');
  });
});

describe('duplicate names in a contact list', () => {
  const threeAmmas: KnownPerson[] = [
    { id: 'a1', name: 'Amma', relationType: 'mother' },
    { id: 'a2', name: 'Amma', relationType: 'mother' },
    { id: 'a3', name: 'Amma', relationType: 'mother' },
  ];

  it('logs one mention once, not once per duplicate record', () => {
    // Deduping by person id fanned one sentence out into three contact logs.
    const r = classifyCapture({ transcript: 'Called Amma tonight.', people: threeAmmas });
    expect(r.peopleIds).toEqual(['a1']);
    expect(r.peopleNames).toEqual(['Amma']);
  });

  it('reports the ambiguity instead of hiding the choice', () => {
    const r = classifyCapture({ transcript: 'Called Amma tonight.', people: threeAmmas });
    expect(r.ambiguousNames).toEqual(['amma']);
  });

  it('reports nothing ambiguous when names are distinct', () => {
    expect(go('Called Amma and Priya.').ambiguousNames).toEqual([]);
  });
});
