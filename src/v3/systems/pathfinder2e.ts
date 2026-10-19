import { defaultDiceEngine } from '../engine.js';
import type { DiceEngine } from '../types.js';
import {
  createSystemDieResult,
  executeSystemRoll,
  invalidSystemInput,
  readOptionalSystemInteger,
  readSystemInput,
  type CompactSystemRollOptions,
  type FullSystemRollOptions,
  type SystemBaseRoll,
  type SystemDieResult,
  type SystemRollDetail,
  type SystemRollOptions,
} from './common.js';

export const PATHFINDER2E_D20_PROFILE = 'pathfinder2e-d20' as const;
export type Pathfinder2eFortune = 'normal' | 'fortune' | 'misfortune';
export type Pathfinder2eDegree =
  | 'critical-success'
  | 'success'
  | 'failure'
  | 'critical-failure'
  | 'pending';
export type Pathfinder2eLabels = Readonly<Partial<Record<Pathfinder2eDegree, string>>>;

export interface Pathfinder2eDieResult extends SystemDieResult<
  typeof PATHFINDER2E_D20_PROFILE, 'd20', string, never
> {
  /** Both physical dice remain auditable; exactly one determines the check. */
  readonly selected: boolean;
}

export interface Pathfinder2eRollInput {
  readonly modifier?: number;
  /** Omit or use null when the GM keeps the Difficulty Class secret. */
  readonly difficulty?: number | null;
  readonly fortune?: Pathfinder2eFortune;
  /** Display labels never change the machine-readable degree. */
  readonly labels?: Pathfinder2eLabels;
}

export interface Pathfinder2eRollResult<Detail extends SystemRollDetail = 'full'> {
  readonly type: 'pathfinder2e-roll';
  readonly schemaVersion: 1;
  readonly system: 'pathfinder2e';
  readonly rulesVersion: 1;
  readonly modifier: number;
  readonly difficulty: number | null;
  readonly natural: number;
  readonly total: number;
  readonly margin: number | null;
  readonly fortune: Pathfinder2eFortune;
  readonly degree: Pathfinder2eDegree;
  readonly succeeds: boolean | null;
  readonly degreeLabel: string;
  readonly dice: readonly Pathfinder2eDieResult[];
  readonly baseRoll: SystemBaseRoll<Detail>;
}

const DEGREES = ['critical-failure', 'failure', 'success', 'critical-success'] as const;
const EMPTY_SYMBOLS = Object.freeze([] as never[]);
const MINIMUM_MODIFIER = Number.MIN_SAFE_INTEGER + 20;
const MAXIMUM_MODIFIER = Number.MAX_SAFE_INTEGER - 20;

function readFortune(value: unknown): Pathfinder2eFortune {
  if (value === undefined) return 'normal';
  if (value === 'normal' || value === 'fortune' || value === 'misfortune') return value;
  throw invalidSystemInput('pathfinder2e', 'fortune', 'must be normal, fortune, or misfortune');
}

function readLabels(value: unknown): Pathfinder2eLabels {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidSystemInput('pathfinder2e', 'labels', 'must be a non-null object');
  }
  const labels: Partial<Record<Pathfinder2eDegree, string>> = {};
  for (const [key, label] of Object.entries(value)) {
    if (
      ![...DEGREES, 'pending'].includes(key)
      || typeof label !== 'string'
      || label.trim().length === 0
      || label.length > 128
    ) {
      throw invalidSystemInput('pathfinder2e', 'labels', 'must contain degree names and non-empty strings up to 128 characters');
    }
    labels[key as Pathfinder2eDegree] = label;
  }
  return labels;
}

function evaluateDegree(natural: number, margin: number | null): Pathfinder2eDegree {
  if (margin === null) return 'pending';
  const base = margin >= 10 ? 3 : margin >= 0 ? 2 : margin <= -10 ? 0 : 1;
  const adjustment = natural === 20 ? 1 : natural === 1 ? -1 : 0;
  return DEGREES[Math.max(0, Math.min(3, base + adjustment))] as Pathfinder2eDegree;
}

/** Rolls a Remaster check, including natural-face degree adjustments. */
export function rollPathfinder2e(
  input: Pathfinder2eRollInput | undefined,
  options: CompactSystemRollOptions,
): Pathfinder2eRollResult<'compact'>;
export function rollPathfinder2e(
  input?: Pathfinder2eRollInput,
  options?: FullSystemRollOptions,
): Pathfinder2eRollResult;
export function rollPathfinder2e(
  input: Pathfinder2eRollInput = {},
  options: SystemRollOptions = {},
): Pathfinder2eRollResult<SystemRollDetail> {
  return rollPathfinder2eWithEngine(defaultDiceEngine, input, options);
}

export function rollPathfinder2eWithEngine(
  engine: DiceEngine,
  input: Pathfinder2eRollInput = {},
  options: SystemRollOptions = {},
): Pathfinder2eRollResult<SystemRollDetail> {
  const source = readSystemInput(input, 'pathfinder2e');
  const modifier = readOptionalSystemInteger(
    source, 'pathfinder2e', 'modifier', MINIMUM_MODIFIER, MAXIMUM_MODIFIER,
  ) ?? 0;
  const difficulty = source['difficulty'] === null
    ? undefined
    : readOptionalSystemInteger(source, 'pathfinder2e', 'difficulty', 0);
  const fortune = readFortune(source['fortune']);
  const labels = readLabels(source['labels']);
  const count = fortune === 'normal' ? 1 : 2;
  const { resolved, baseRoll } = executeSystemRoll(engine, `${count}d20`, options);
  if (
    resolved.dice.length !== count
    || resolved.dice.some((die) => die.sides !== 20
      || !Number.isInteger(die.rawValue) || die.rawValue < 1 || die.rawValue > 20)
  ) {
    throw new Error(`PF2 checks must resolve exactly ${count} valid d20 dice.`);
  }
  let selectedIndex = 0;
  if (fortune !== 'normal') {
    const first = resolved.dice[0];
    const second = resolved.dice[1];
    if (first !== undefined && second !== undefined
      && (fortune === 'fortune' ? second.rawValue > first.rawValue : second.rawValue < first.rawValue)) {
      selectedIndex = 1;
    }
  }
  const dice = resolved.dice.map((die, index): Pathfinder2eDieResult => ({
    ...createSystemDieResult(die, PATHFINDER2E_D20_PROFILE, 'd20', String(die.rawValue), EMPTY_SYMBOLS),
    selected: index === selectedIndex,
  }));
  const selected = dice[selectedIndex];
  if (selected === undefined) throw new Error('PF2 checks require a selected d20.');
  const natural = selected.rawValue;
  const total = natural + modifier;
  const margin = difficulty === undefined ? null : total - difficulty;
  if (margin !== null && !Number.isSafeInteger(margin)) {
    throw invalidSystemInput('pathfinder2e', 'difficulty', 'must produce a safe integer margin');
  }
  const degree = evaluateDegree(natural, margin);
  return {
    type: 'pathfinder2e-roll',
    schemaVersion: 1,
    system: 'pathfinder2e',
    rulesVersion: 1,
    modifier,
    difficulty: difficulty ?? null,
    natural,
    total,
    margin,
    fortune,
    degree,
    succeeds: degree === 'pending' ? null : degree === 'success' || degree === 'critical-success',
    degreeLabel: labels[degree] ?? degree,
    dice,
    baseRoll,
  };
}
