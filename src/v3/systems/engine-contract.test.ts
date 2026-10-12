import { describe, expect, test, vi } from 'vitest';
import { createDiceEngine } from '../engine.js';
import { rollAssimilationWithEngine } from './assimilation.js';
import { rollFateDiceWithEngine } from './fate.js';
import { rollDaggerheartWithEngine } from './daggerheart.js';
import { rollMixedDiceWithEngine } from './mixed.js';
import { rollPathfinder2eWithEngine } from './pathfinder2e.js';

describe('custom engine contract validation', () => {
  test.each([
    [], [{ rawValue: 1, sides: 12 }], [{ rawValue: 0, sides: 20 }],
    [{ rawValue: 21, sides: 20 }], [{ rawValue: 1.5, sides: 20 }],
    [{ rawValue: 10, sides: 20 }, { rawValue: 10, sides: 20 }],
  ].map((faces) => ({ faces })))('rejects malformed PF2 d20 results %j', ({ faces }) => {
    const engine = createDiceEngine();
    const result = engine.roll('2d20', { seed: 'pf2-contract' });
    vi.spyOn(engine, 'roll').mockReturnValue({
      ...result,
      dice: faces.map((face, index) => ({ ...result.dice[index], ...face })) as typeof result.dice,
    });
    expect(() => rollPathfinder2eWithEngine(engine)).toThrow('PF2 checks must resolve exactly 1 valid d20 dice.');
  });
  test.each([
    [{ rawValue: 13 }, 'Unsupported Assimilation face: 13'],
    [{ sides: 'F' }, 'Assimilation does not support Fudge dice'],
    [{ sides: 8 }, 'Unsupported Assimilation die: d8'],
  ] as const)('rejects invalid assimilation dice %j', (overrides, message) => {
    const engine = createDiceEngine();
    const result = engine.roll('d6', { seed: 'contract' });
    vi.spyOn(engine, 'roll').mockReturnValue({ ...result, dice: result.dice.map((die) => ({ ...die, ...overrides })) });
    expect(() => rollAssimilationWithEngine(engine, { d6: 1 })).toThrow(message);
  });

  test('rejects invalid Fate faces', () => {
    const engine = createDiceEngine();
    const result = engine.roll('d6', { seed: 'contract' });
    vi.spyOn(engine, 'roll').mockReturnValue({ ...result, dice: result.dice.map((die) => ({ ...die, rawValue: 0 })) });
    expect(() => rollFateDiceWithEngine(engine, { dice: 1 })).toThrow('Unsupported Fate face: 0');
  });

  test.each([0, 1])('rejects Daggerheart results with %i dice', (count) => {
    const engine = createDiceEngine();
    const result = engine.roll('d12+d12', { seed: 'contract' });
    vi.spyOn(engine, 'roll').mockReturnValue({ ...result, dice: result.dice.slice(0, count) });
    expect(() => rollDaggerheartWithEngine(engine)).toThrow('Daggerheart Duality Dice must resolve exactly two d12s.');
  });

  test('enforces combined budgets when the last segment starts at an exhausted limit', () => {
    expect(() => rollMixedDiceWithEngine(createDiceEngine(), 'd1;1', {
      seed: 'contract', limits: { maxEvents: 3 },
    })).toThrow(expect.objectContaining({ code: 'EVENT_LIMIT_EXCEEDED' }));
  });
});
