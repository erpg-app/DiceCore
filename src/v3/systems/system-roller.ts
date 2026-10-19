import type { DiceEngine } from '../types.js';
import {
  rollPathfinder2eWithEngine,
  type Pathfinder2eRollInput,
  type Pathfinder2eRollResult,
} from './pathfinder2e.js';
import {
  rollAssimilationWithEngine,
  type AssimilationRollInput,
  type AssimilationRollResult,
} from './assimilation.js';
import {
  rollDaggerheartWithEngine,
  type DaggerheartRollInput,
  type DaggerheartRollResult,
} from './daggerheart.js';
import {
  rollFateDiceWithEngine,
  type FateRollInput,
  type FateRollResult,
} from './fate.js';
import {
  rollMixedDiceWithEngine,
  type MixedCompactRollOptions,
  type MixedFullRollOptions,
  type MixedRollResult,
} from './mixed.js';
import {
  rollVampireV5WithEngine,
  type VampireV5RollInput,
  type VampireV5RollResult,
} from './vampire-v5.js';
import type {
  CompactSystemRollOptions,
  FullSystemRollOptions,
  SystemRollOptions,
} from './common.js';

/** System adapters bound to one configured dice engine and its cache/policy. */
export interface SystemRoller {
  rollPathfinder2e(
    input: Pathfinder2eRollInput | undefined,
    options: CompactSystemRollOptions,
  ): Pathfinder2eRollResult<'compact'>;
  rollPathfinder2e(
    input?: Pathfinder2eRollInput,
    options?: FullSystemRollOptions,
  ): Pathfinder2eRollResult;
  rollAssimilation(
    input: AssimilationRollInput,
    options: CompactSystemRollOptions,
  ): AssimilationRollResult<'compact'>;
  rollAssimilation(
    input: AssimilationRollInput,
    options?: FullSystemRollOptions,
  ): AssimilationRollResult;
  rollDaggerheart(
    input: DaggerheartRollInput | undefined,
    options: CompactSystemRollOptions,
  ): DaggerheartRollResult<'compact'>;
  rollDaggerheart(
    input?: DaggerheartRollInput,
    options?: FullSystemRollOptions,
  ): DaggerheartRollResult;
  rollFateDice(
    input: FateRollInput | undefined,
    options: CompactSystemRollOptions,
  ): FateRollResult<'compact'>;
  rollFateDice(
    input?: FateRollInput,
    options?: FullSystemRollOptions,
  ): FateRollResult;
  rollMixedDice(input: string, options: MixedCompactRollOptions): MixedRollResult<'compact'>;
  rollMixedDice(input: string, options?: MixedFullRollOptions): MixedRollResult;
  rollVampireV5(
    input: VampireV5RollInput,
    options: CompactSystemRollOptions,
  ): VampireV5RollResult<'compact'>;
  rollVampireV5(
    input: VampireV5RollInput,
    options?: FullSystemRollOptions,
  ): VampireV5RollResult;
}

export function createSystemRoller(engine: DiceEngine): SystemRoller {
  if (typeof engine !== 'object' || engine === null
    || typeof engine.roll !== 'function'
    || typeof engine.rollDetails !== 'function'
    || typeof engine.compile !== 'function') {
    throw new TypeError('createSystemRoller requires a DiceEngine');
  }

  return {
    rollPathfinder2e: (input: Pathfinder2eRollInput = {}, options: SystemRollOptions = {}) => (
      rollPathfinder2eWithEngine(engine, input, options)
    ),
    rollAssimilation: (input: AssimilationRollInput, options: SystemRollOptions = {}) => (
      rollAssimilationWithEngine(engine, input, options)
    ),
    rollDaggerheart: (input: DaggerheartRollInput = {}, options: SystemRollOptions = {}) => (
      rollDaggerheartWithEngine(engine, input, options)
    ),
    rollFateDice: (input: FateRollInput = {}, options: SystemRollOptions = {}) => (
      rollFateDiceWithEngine(engine, input, options)
    ),
    rollMixedDice: (input: string, options: MixedFullRollOptions = {}) => (
      rollMixedDiceWithEngine(engine, input, options)
    ),
    rollVampireV5: (input: VampireV5RollInput, options: SystemRollOptions = {}) => (
      rollVampireV5WithEngine(engine, input, options)
    ),
  } as SystemRoller;
}
