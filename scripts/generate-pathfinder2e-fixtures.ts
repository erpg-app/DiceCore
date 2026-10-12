import { readFileSync, writeFileSync } from 'node:fs';
import { createDiceEngine } from '../src/v3/engine.js';
import { DiceRollError } from '../src/v3/errors.js';
import { rollMixedDice } from '../src/v3/systems/mixed.js';
import { rollPathfinder2e, rollPathfinder2eWithEngine } from '../src/v3/systems/pathfinder2e.js';
import type { SystemRollOptions } from '../src/v3/systems/common.js';
import type { Pathfinder2eRollInput } from '../src/v3/systems/pathfinder2e.js';

const target = new URL('../go/testdata/pathfinder2e-parity.json', import.meta.url);
const mode = process.argv[2];
if (mode !== undefined && mode !== '--check') {
  throw new Error('Usage: tsx scripts/generate-pathfinder2e-fixtures.ts [--check]');
}
const capture = (run: () => unknown): object => {
  try { return { value: run() }; }
  catch (error: unknown) {
    return { error: error instanceof DiceRollError ? error.toJSON()
      : { name: error instanceof Error ? error.name : 'Error', message: String(error instanceof Error ? error.message : error) } };
  }
};
const cases: object[] = [];
const contracts: object[] = [];
const unsafeRoll = rollPathfinder2e as (input: unknown, options: SystemRollOptions) => unknown;
function add(input: unknown, options: SystemRollOptions = { seed: 'pf2-validation' }): void {
  cases.push({ name: `pf2-${cases.length + 1}`, system: 'pathfinder2e', input, options,
    outcome: capture(() => unsafeRoll(input, options)) });
}
const inputs: Pathfinder2eRollInput[] = [
  {}, { modifier: -2, difficulty: 15 }, { difficulty: 0 }, { difficulty: 99 },
  { modifier: 5, fortune: 'fortune', difficulty: 20 },
  { modifier: 5, fortune: 'misfortune', difficulty: 20 },
  { modifier: -4, fortune: 'fortune', difficulty: null },
  { labels: { pending: 'CD secreta' } },
  { difficulty: 15, labels: { 'critical-success': 'Sucesso crítico', success: 'Sucesso', failure: 'Falha', 'critical-failure': 'Falha crítica' } },
];
for (const randomAlgorithm of ['mt19937', 'xoshiro128ss'] as const) {
  for (const detail of ['full', 'compact'] as const) {
    for (const seed of [0, 1, 'pf2/ação 🎲']) {
      for (const input of inputs) add(input, { seed, randomAlgorithm, detail });
    }
  }
}
for (const input of [null, [], 1, 'invalid', { modifier: 1.5 }, { modifier: 9007199254740991 },
  { difficulty: -1 }, { difficulty: '15' }, { fortune: 1 }, { fortune: 'invalid' },
  { labels: null }, { labels: { invalid: 'x' } }, { labels: { success: '' } },
  { labels: { success: 'x'.repeat(129) } }, { labels: { success: 1 } },
  { modifier: -9007199254740971, difficulty: 9007199254740991 },
]) add(input);
for (const detail of ['full', 'compact'] as const) {
  add({ fortune: 'fortune' }, { seed: 'pf2-limit', detail, limits: { maxInitialDice: 1 } });
}
for (const input of [
  'pf2(5,20,1);d20;dh(2,15)', 'pf2e(-2,null,-1);pathfinder2e(mod=0,cd=10,fortuna=0)',
  'pf2(fortune=1);pf2(mod=2,dc=null,fortune=-1);pf2()',
  'pf2(1,2,3)', 'pf2(1,2,1,0)', 'pf2(null)', 'pf2(0,)', 'pf2(mod=1,2)',
  'pf2(dc=10,cd=null)', 'pf2(mod=1,modifier=2)', 'pf2(unknown=1)',
  'pf2(fortune=null)', 'pf2(0,10,fortune)',
]) {
  const options = { seed: 'pf2-mixed-parity' };
  cases.push({ name: `mixed-${cases.length + 1}`, system: 'mixed', input, options,
    outcome: capture(() => rollMixedDice(input, options)) });
}

function contract(faces: readonly number[], input: Pathfinder2eRollInput, detail: 'full' | 'compact'): void {
  const engine = createDiceEngine();
  const notation = `${Math.max(1, faces.length)}d20`;
  const base = engine.roll(notation, { seed: 'pf2-contract-base' });
  const dice = base.dice.slice(0, faces.length).map((die, index) => ({
    ...die, rawValue: faces[index] as number, value: faces[index] as number,
  }));
  const engineResult = { ...base, dice };
  const engineDetails = { ...engine.rollDetails(notation, { seed: 'pf2-contract-base' }), dice };
  const injectedEngine = { ...engine, roll: () => engineResult, rollDetails: () => engineDetails };
  const options: SystemRollOptions = detail === 'compact' ? { detail } : { detail };
  contracts.push({ name: `contract-${contracts.length + 1}`, system: 'pathfinder2e',
    input, options, engineResult, engineDetails,
    outcome: capture(() => rollPathfinder2eWithEngine(injectedEngine, input, options)) });
}
for (const detail of ['full', 'compact'] as const) {
  for (const natural of [1, 2, 10, 19, 20]) {
    for (const margin of [-20, -10, -9, -1, 0, 9, 10, 20]) {
      contract([natural], { modifier: 30 - natural, difficulty: 30 - margin }, detail);
    }
    contract([natural], { difficulty: null }, detail);
  }
  for (const fortune of ['fortune', 'misfortune'] as const) {
    for (const faces of [[1, 20], [20, 1], [7, 7]]) {
      contract(faces, { fortune, modifier: 5, difficulty: 15 }, detail);
    }
  }
  for (const faces of [[], [0], [21], [1.5], [10, 10]]) contract(faces, {}, detail);
}
const data = `${JSON.stringify({ schemaVersion: 1,
  provenance: { package: '@erpg/dicecore', source: 'scripts/generate-pathfinder2e-fixtures.ts', rulesVersion: 1 },
  cases, contracts }, null, 2)}\n`;
if (mode === '--check') {
  if (readFileSync(target, 'utf8') !== data) throw new Error('Changed PF2 parity fixture');
} else writeFileSync(target, data);
console.log(`${mode === '--check' ? 'Verified' : 'Wrote'} PF2 parity: ${cases.length} rolls and ${contracts.length} injected-engine contracts`);
