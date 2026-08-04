import { describe, it, expect } from 'vitest';
import { setting, fitsSetting, settingLimits, SETTING_LABELS } from './setting';

describe('setting', () => {
  it('a desk has a screen and no privacy to speak in', () => {
    const s = setting('desk');
    expect(s.hasScreen).toBe(true);
    expect(s.canSpeakFreely).toBe(false);
    expect(s.canMove).toBe(false);
  });

  it('their own time allows everything', () => {
    expect(setting('free')).toEqual({
      canSpeakFreely: true, canMove: true, hasScreen: true, isPrivate: true,
    });
  });

  it('out and about has legs and a phone, not a desk', () => {
    const s = setting('out');
    expect(s.canMove).toBe(true);
    expect(s.canSpeakFreely).toBe(true);
    expect(s.hasScreen).toBe(false);
  });

  it('company means free to move, not free to disappear', () => {
    const s = setting('around_people');
    expect(s.canMove).toBe(true);
    expect(s.isPrivate).toBe(false);
  });

  it('not said is not cannot — unknown allows everything', () => {
    for (const s of [setting(), setting(null), setting('nonsense' as never)]) {
      expect(s).toEqual({
        canSpeakFreely: true, canMove: true, hasScreen: true, isPrivate: true,
      });
    }
  });

  it('offers a label for every setting it can be asked about', () => {
    for (const key of ['desk', 'free', 'out', 'around_people'] as const) {
      expect(SETTING_LABELS[key]).toBeTruthy();
    }
  });
});

describe('fitsSetting', () => {
  it('lets a thing with no requirements happen anywhere', () => {
    expect(fitsSetting(undefined, setting('desk'))).toBe(true);
    expect(fitsSetting([], setting('desk'))).toBe(true);
  });

  it('keeps a call away from an open-plan desk', () => {
    expect(fitsSetting(['canSpeakFreely'], setting('desk'))).toBe(false);
    expect(fitsSetting(['canSpeakFreely'], setting('out'))).toBe(true);
  });

  it('keeps a walk out of a cancelled meeting slot', () => {
    expect(fitsSetting(['canMove'], setting('desk'))).toBe(false);
    expect(fitsSetting(['canMove'], setting('free'))).toBe(true);
  });

  it('needs every requirement, not one of them', () => {
    // A private conversation needs both speech and privacy; company gives
    // neither, and being out gives only the first.
    expect(fitsSetting(['canSpeakFreely', 'isPrivate'], setting('out'))).toBe(false);
    expect(fitsSetting(['canSpeakFreely', 'isPrivate'], setting('free'))).toBe(true);
  });

  it('puts the deep block at the desk it belongs to', () => {
    expect(fitsSetting(['hasScreen'], setting('desk'))).toBe(true);
    expect(fitsSetting(['hasScreen'], setting('out'))).toBe(false);
  });
});

describe('settingLimits', () => {
  it('names what a desk rules out, so the app is not just quiet', () => {
    const limits = settingLimits(setting('desk'));
    expect(limits).toContain('nothing that needs a private call');
    expect(limits).toContain('nothing that needs you on your feet');
  });

  it('has nothing to apologise for in their own time', () => {
    expect(settingLimits(setting('free'))).toEqual([]);
    expect(settingLimits(setting())).toEqual([]);
  });
});
