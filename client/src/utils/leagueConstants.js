// Position and category constants matching app/classes/league.ts

export const POSITIONS = [
  'C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL',
  'SP', 'RP', 'P',
  'BN', 'IL', 'NA',
];

/** Sort order for roster display (position or selected_position). */
export const POSITION_SORT_ORDER = {
  'C': 1, '1B': 2, '2B': 3, '3B': 4, 'SS': 5, 'OF': 6, 'UTIL': 7,
  'SP': 8, 'RP': 9, 'P': 10, 'BN': 11, 'IL': 12, 'NA': 13,
};

const HITTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL'];
const PITCHER_POSITIONS = ['SP', 'RP', 'P'];
const BENCH_POSITIONS = ['BN'];

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

/** Hitter category order for display (e.g. Scoring Value tab). */
export const HITTER_CATEGORIES = ['AB', 'H', 'R', 'RBI', 'AVG', 'HR', 'SB'];

/** Pitcher category order for display. */
export const PITCHER_CATEGORIES = ['IP', 'K', 'ERA', 'WHIP', 'QS', 'SV', 'HLD', 'SVH'];
