// Position and category constants matching app/classes/league.ts

export const POSITIONS = [
  'C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL',
  'SP', 'RP', 'P',
  'BN', 'IL', 'NA',
];

const HITTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL'];
const PITCHER_POSITIONS = ['SP', 'RP', 'P'];
const BENCH_POSITIONS = ['BN'];
const IL_POSITIONS = ['IL'];
const NA_POSITIONS = ['NA'];

export function defaultCountsTowardsRemainingRoster(position) {
  const p = position?.toUpperCase?.() || position;
  return (
    HITTER_POSITIONS.includes(p) ||
    PITCHER_POSITIONS.includes(p) ||
    BENCH_POSITIONS.includes(p)
  );
}

export const CATEGORY_CODES = [
  'AB', 'H', 'R', 'RBI', 'AVG', 'HR', 'SB',
  'IP', 'K', 'ERA', 'WHIP', 'QS', 'SV', 'HLD', 'SVH',
];
