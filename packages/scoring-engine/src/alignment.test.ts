import { describe, it, expect } from 'vitest';
import { lifeAlignment, DomainBalance } from './alignment';

const d = (domainType: string, importance: number, attention: number): DomainBalance =>
  ({ domainType, importance, attention });

describe('lifeAlignment', () => {
  it('is 100 when attention is distributed exactly as declared', () => {
    expect(lifeAlignment([d('family', 60, 60), d('career', 40, 40)]).score).toBe(100);
  });

  it('is scale-free — only the shape of the distribution matters', () => {
    // Someone who rates everything high and someone who rates everything low
    // are describing the same life. Levels are a personality, shares are a life.
    const modest = lifeAlignment([d('family', 30, 15), d('career', 20, 10)]).score;
    const emphatic = lifeAlignment([d('family', 90, 45), d('career', 60, 30)]).score;
    expect(modest).toBe(emphatic);
    expect(modest).toBe(100);
  });

  it('notices a starved domain the old formula could not see', () => {
    /**
     * The case that exposed the bug: `purpose` declared 12 and lived 0 while
     * everything else is fed. The shipped measure weighted the gap by
     * importance, so a low-importance domain contributed almost nothing and
     * the score came back 98.8 — silent about the only thing that was wrong.
     */
    const life = [
      d('purpose', 12, 0),
      d('friends', 18, 6),
      d('health', 68, 100),
      d('career', 48, 77),
      d('family', 50, 100),
    ];
    const reading = lifeAlignment(life);
    expect(reading.score).toBeLessThan(90);
    /**
     * `friends`, not `purpose` — and that is the measure working. Starvation
     * is a shortfall in *share*: friends asked for 9.2% of the attention in
     * this life and received 2.1%, a bigger debt than purpose asking for 6.1%
     * and receiving none. Being at zero is loud; being at a fifth of a larger
     * claim is louder.
     */
    expect(reading.starved?.domainType).toBe('friends');
    expect(reading.fed?.domainType).toBe('family');
  });

  it('charges for over-attention, not only neglect', () => {
    // 100 poured into something rated 6 is the life going somewhere its owner
    // never chose. The old measure scored this as perfect.
    const reading = lifeAlignment([d('partner', 6, 100), d('career', 94, 20)]);
    expect(reading.score).toBeLessThan(50);
    expect(reading.fed?.domainType).toBe('partner');
    expect(reading.starved?.domainType).toBe('career');
  });

  it('uses the full range rather than bunching against the ceiling', () => {
    const perfect = lifeAlignment([d('a', 50, 50), d('b', 50, 50)]).score;
    const inverted = lifeAlignment([d('a', 100, 0), d('b', 0.0001, 100)]).score;
    expect(perfect).toBe(100);
    expect(inverted).toBeLessThan(5);
  });

  it('reports the shortfall in share points, which is the honest unit', () => {
    // friends asked for half and got a fifth.
    const reading = lifeAlignment([d('friends', 50, 20), d('career', 50, 80)]);
    expect(reading.worstGapPoints).toBeCloseTo(30, 0);
    expect(reading.starved?.domainType).toBe('friends');
  });

  it('ignores domains never claimed rather than counting them as failures', () => {
    const withDormant = lifeAlignment([d('family', 60, 60), d('career', 40, 40), d('impact', 0, 0)]);
    expect(withDormant.score).toBe(100);
  });

  it('is 0, not NaN, when nothing has any attention at all', () => {
    const reading = lifeAlignment([d('family', 60, 0), d('career', 40, 0)]);
    expect(reading.score).toBe(0);
    expect(reading.starved?.domainType).toBe('family');
  });

  it('is 0, not NaN, for a life with nothing declared', () => {
    expect(lifeAlignment([]).score).toBe(0);
    expect(lifeAlignment([d('family', 0, 30)]).score).toBe(0);
  });

  it('never returns a score outside 0..100', () => {
    const cases: DomainBalance[][] = [
      [d('a', 100, -50)],
      [d('a', 1, 1000), d('b', 99, 0)],
      [d('a', 0.1, 0.1), d('b', 0.1, 99)],
    ];
    for (const c of cases) {
      const { score } = lifeAlignment(c);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
