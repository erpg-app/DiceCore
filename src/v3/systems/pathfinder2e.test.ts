import { describe, expect, test, vi } from 'vitest';
import { createDiceEngine } from '../engine.js';
import {
  PATHFINDER2E_D20_PROFILE,
  rollPathfinder2e,
  rollPathfinder2eWithEngine,
  type Pathfinder2eRollInput,
} from './pathfinder2e.js';
import { rollMixedDice } from './mixed.js';

function fixedCheck(faces: readonly number[], input: Pathfinder2eRollInput) {
  const engine = createDiceEngine();
  const base = engine.roll(`${faces.length}d20`, { seed: 'pf2-fixed-faces' });
  const dice = base.dice.map((die, index) => ({
    ...die, rawValue: faces[index] as number, value: faces[index] as number,
  }));
  vi.spyOn(engine, 'roll').mockReturnValue({ ...base, dice });
  return rollPathfinder2eWithEngine(engine, input);
}

describe('PF2 Remaster checks', () => {
  test.each([
    [10, 0, 0, 'critical-success'],
    [10, 0, 1, 'success'],
    [10, 0, 10, 'success'],
    [10, 0, 11, 'failure'],
    [10, 0, 19, 'failure'],
    [10, 0, 20, 'critical-failure'],
    [20, 0, 30, 'failure'],
    [20, 0, 29, 'success'],
    [20, 0, 20, 'critical-success'],
    [20, 0, 0, 'critical-success'],
    [1, 0, 0, 'failure'],
    [1, 20, 0, 'success'],
    [1, 0, 2, 'critical-failure'],
    [1, 0, 20, 'critical-failure'],
    [10, -15, 0, 'failure'],
  ] as const)('resolves d20=%i mod=%i DC=%i as %s', (natural, modifier, difficulty, degree) => {
    const roll = fixedCheck([natural], { modifier, difficulty });
    expect(roll).toMatchObject({
      type: 'pathfinder2e-roll', system: 'pathfinder2e', schemaVersion: 1, rulesVersion: 1,
      natural, modifier, difficulty, total: natural + modifier,
      margin: natural + modifier - difficulty, degree, degreeLabel: degree,
      succeeds: degree === 'success' || degree === 'critical-success', fortune: 'normal',
    });
    expect(roll.dice[0]).toMatchObject({
      profileId: PATHFINDER2E_D20_PROFILE, dieKind: 'd20', sides: 20,
      faceKey: String(natural), rawValue: natural, symbols: [], selected: true,
    });
  });

  test.each([1, 20])('keeps natural %i pending for a secret DC', (natural) => {
    expect(fixedCheck([natural], {})).toMatchObject({
      natural, degree: 'pending', difficulty: null, margin: null, succeeds: null,
    });
    expect(fixedCheck([natural], { difficulty: null }).degree).toBe('pending');
  });

  test.each([
    ['fortune', [3, 20], 20, 1],
    ['fortune', [20, 3], 20, 0],
    ['misfortune', [1, 19], 1, 0],
    ['misfortune', [19, 1], 1, 1],
    ['fortune', [7, 7], 7, 0],
    ['misfortune', [7, 7], 7, 0],
  ] as const)('selects exactly one %s face from %j', (fortune, faces, natural, selectedIndex) => {
    const roll = fixedCheck(faces, { fortune, modifier: 5, difficulty: 15 });
    expect(roll.natural).toBe(natural);
    expect(roll.total).toBe(natural + 5);
    expect(roll.baseRoll.notation).toBe('2d20');
    expect(roll.dice.map((die) => die.rawValue)).toEqual(faces);
    expect(roll.dice.map((die) => die.selected)).toEqual([selectedIndex === 0, selectedIndex === 1]);
  });

  test('supports localized labels without changing the degree', () => {
    expect(fixedCheck([12], { difficulty: 10, labels: { success: 'Sucesso' } }))
      .toMatchObject({ degree: 'success', degreeLabel: 'Sucesso' });
    expect(fixedCheck([12], { labels: { pending: 'CD secreta' } }))
      .toMatchObject({ degree: 'pending', degreeLabel: 'CD secreta' });
  });

  test.each(['mt19937', 'xoshiro128ss'] as const)('replays full and compact checks with %s', (randomAlgorithm) => {
    const input = { modifier: -3, difficulty: 18, fortune: 'fortune' } as const;
    const full = rollPathfinder2e(input, { seed: 'pf2/ação 🎲', randomAlgorithm });
    expect(rollPathfinder2e(input, { replay: full.baseRoll.replay })).toEqual(full);
    const compact = rollPathfinder2e(input, { replay: full.baseRoll.replay, detail: 'compact' });
    expect(compact.dice).toEqual(full.dice);
    expect(compact.degree).toBe(full.degree);
    expect(compact.baseRoll.type).toBe('dice-roll-summary');
    expect('dice' in compact.baseRoll).toBe(false);
  });

  test.each([
    null, [], { modifier: 1.5 }, { modifier: Number.MAX_SAFE_INTEGER },
    { difficulty: -1 }, { difficulty: 1.5 }, { difficulty: '10' },
    { fortune: 1 }, { fortune: 'invalid' }, { labels: null }, { labels: [] },
    { labels: { invalid: 'Label' } }, { labels: { success: '' } },
    { labels: { success: 1 } }, { labels: { success: 'x'.repeat(129) } },
    { modifier: Number.MIN_SAFE_INTEGER + 20, difficulty: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid input %j', (input) => {
    expect(() => rollPathfinder2e(input as never, { seed: 'invalid-input' }))
      .toThrow(expect.objectContaining({ code: 'INVALID_SYSTEM_INPUT' }));
  });

  test('inherits the configured dice limits', () => {
    expect(() => rollPathfinder2e({ fortune: 'fortune' }, { limits: { maxInitialDice: 1 } }))
      .toThrow(expect.objectContaining({ code: 'TOO_MANY_INITIAL_DICE' }));
  });

  test('rejects sparse engine dice instead of reporting a check degree', () => {
    const engine = createDiceEngine();
    const base = engine.roll('d20', { seed: 'pf2-sparse-engine' });
    const dice = new Array<(typeof base.dice)[number]>(1);
    vi.spyOn(engine, 'roll').mockReturnValue({ ...base, dice });
    expect(() => rollPathfinder2eWithEngine(engine, { difficulty: 10 }))
      .toThrow('PF2 checks require a selected d20.');
  });
});

describe('PF2 mixed notation', () => {
  test('accepts an explicit secret DC in named arguments with misfortune', () => {
    const roll = rollMixedDice('pf2(mod=-2,cd=null,fortune=-1)', { seed: 'pf2-named-secret-dc' });
    expect(roll.notation).toBe('pathfinder2e(modifier=-2,fortune=-1)');
    expect(roll.rolls[0]?.result).toMatchObject({
      modifier: -2, difficulty: null, margin: null, degree: 'pending', fortune: 'misfortune',
    });
    expect(roll.dice).toHaveLength(2);
  });

  test('accepts aliases, optional DC, fortune and named Portuguese arguments', () => {
    const roll = rollMixedDice('pf2(5,15,1);pf2e(-2,null,-1);pathfinder2e(mod=0,cd=10,fortuna=0);pf2(fortune=1)', { seed: 'pf2-mixed' });
    expect(roll.notation).toBe('pathfinder2e(modifier=5,difficulty=15,fortune=1); pathfinder2e(modifier=-2,fortune=-1); pathfinder2e(modifier=0,difficulty=10); pathfinder2e(modifier=0,fortune=1)');
    expect(roll.rolls.every((item) => item.kind === 'pathfinder2e')).toBe(true);
    expect(roll.dice).toHaveLength(7);
    expect(roll.output).toContain('(pending)');
    expect(rollMixedDice(roll.notation, { replay: roll.replay }).rolls).toEqual(roll.rolls);
    const secret = roll.rolls[1];
    if (secret?.kind === 'pathfinder2e') expect(secret.result.degree).toBe('pending');
  });

  test('participates in mixed dice budgets and compact output', () => {
    expect(() => rollMixedDice('pf2(0,10,1);d20', { limits: { maxInitialDice: 2 } }))
      .toThrow(expect.objectContaining({ code: 'TOO_MANY_INITIAL_DICE' }));
    const roll = rollMixedDice('pf2();d20', { seed: 'pf2-compact', detail: 'compact' });
    const first = roll.rolls[0];
    if (first?.kind === 'pathfinder2e') expect(first.result.baseRoll.type).toBe('dice-roll-summary');
    expect(roll.rolls[1]?.result.type).toBe('dice-roll');
  });

  test.each([
    'pf2(1,2,3)', 'pf2(1,2,1,0)', 'pf2(null)', 'pf2(0,)', 'pf2(mod=1,2)',
    'pf2(dc=10,cd=null)', 'pf2(mod=1,modifier=2)', 'pf2(unknown=1)',
    'pf2(fortune=null)', 'pf2(0,10,fortune)', 'dh(0,null)',
  ])('rejects malformed or ambiguous arguments %s', (notation) => {
    expect(() => rollMixedDice(notation)).toThrow(expect.objectContaining({ code: 'INVALID_NOTATION' }));
  });
});
