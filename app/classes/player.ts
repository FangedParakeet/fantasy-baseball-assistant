import type { QueryableDB } from '../db/db';
import { executeInTransaction } from '../db/db';
import type { HitterCategory, PitcherCategory } from './league';
import type { LeagueTeam } from './team';

type DefaultPlayerFields = 'id' | 'name' | 'mlb_team' | 'eligible_positions' | 'selected_position' | 'headshot_url';

/** Single source of truth for scoring field names; types are derived from these for runtime validation (e.g. orderBy). */
const PITCHER_BASIC_SCORING_FIELDS = ['strikeouts', 'era', 'whip', 'qs', 'sv', 'hld', 'ip'] as const;
const PITCHER_ADVANCED_SCORING_FIELDS = ['k_per_9', 'bb_per_9', 'fip'] as const;
const HITTER_BASIC_SCORING_FIELDS = ['runs', 'hr', 'rbi', 'sb', 'avg', 'hits', 'abs'] as const;
const HITTER_ADVANCED_SCORING_FIELDS = ['obp', 'slg', 'ops', 'k_rate', 'bb_rate', 'iso', 'wraa'] as const;


export type PitcherBasicScoringFields = typeof PITCHER_BASIC_SCORING_FIELDS[number];
export type PitcherAdvancedScoringFields = typeof PITCHER_ADVANCED_SCORING_FIELDS[number];
export type HitterBasicScoringFields = typeof HITTER_BASIC_SCORING_FIELDS[number];
export type HitterAdvancedScoringFields = typeof HITTER_ADVANCED_SCORING_FIELDS[number];
export type PlayerScoringFields = PitcherBasicScoringFields | HitterBasicScoringFields;
export type PlayerAdvancedScoringFields = PitcherAdvancedScoringFields | HitterAdvancedScoringFields;

/** Allowed orderBy values for pitcher stats (runtime whitelist for SQL safety). */
const PITCHER_ORDER_BY_ALLOWED = new Set<string>([
    ...PITCHER_BASIC_SCORING_FIELDS,
    ...PITCHER_ADVANCED_SCORING_FIELDS,
]);
/** Allowed orderBy values for hitter stats (runtime whitelist for SQL safety). */
const HITTER_ORDER_BY_ALLOWED = new Set<string>([
    ...HITTER_BASIC_SCORING_FIELDS,
    ...HITTER_ADVANCED_SCORING_FIELDS,
]);

export type PlayerSelectScoringFields = {
    basic: PlayerScoringFields[];
    advanced: PlayerAdvancedScoringFields[];
    raw: PlayerScoringFields[];
};

/** Table aliases as const so the same identifiers can be used in type definitions (e.g. TwoStartPitcher) and at runtime. */
const PLAYERS_TABLE_ALIAS = 'p' as const;
const BASIC_ROLLING_STATS_TABLE_ALIAS = 'prs_raw' as const;
const BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS = 'prs_pct' as const;
const ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS = 'pars_pct' as const;
const PROBABLE_PITCHERS_TABLE_ALIAS = 'pp' as const;
const PLAYER_LOOKUPS_TABLE_ALIAS = 'pl' as const;
const TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS = 'trs_pct' as const;
const TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS = 'tvp_pct' as const;
const TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS = 'tvb_pct' as const;
const PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS = 'pvs' as const;
const PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS = 'pvc' as const;

/** Table names (not specific to Player; shared where queries reference these tables). */
const PROBABLE_PITCHERS_TABLE = 'probable_pitchers';
const PLAYERS_TABLE = 'players';
const TEAMS_TABLE = 'teams';
const PLAYER_LOOKUPS_TABLE = 'player_lookup';
const BASIC_ROLLING_STATS_TABLE = 'player_rolling_stats';
const BASIC_ROLLING_STATS_PERCENTILES_TABLE = 'player_rolling_stats_percentiles';
const ADVANCED_ROLLING_STATS_PERCENTILES_TABLE = 'player_advanced_rolling_stats_percentiles';
const TEAM_ROLLING_STATS_PERCENTILES_TABLE = 'team_rolling_stats_percentiles';
const TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE = 'team_vs_pitcher_splits_percentiles';
const TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE = 'team_vs_batter_splits_percentiles';
const PLAYER_VALUE_SNAPSHOTS_TABLE = 'player_value_snapshots';
const PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE = 'player_value_snapshot_components';
const TEAM_VALUE_SNAPSHOT_CATEGORY_TOTALS_TABLE = 'team_value_snapshot_category_totals';
const TEAM_VALUE_SNAPSHOT_POSITION_TOTALS_TABLE = 'team_value_snapshot_position_totals';
const PLAYER_GAME_LOGS_TABLE = 'player_game_logs';
const PLAYER_SEASON_STATS_TABLE = 'player_season_stats';
const PLAYER_SEASON_STATS_PERCENTILES_TABLE = 'player_season_stats_percentiles';
const ADVANCED_ROLLING_STATS_TABLE = 'player_advanced_rolling_stats';

/** Percentile and reliability fields from getFields(); scoring keys use table aliases. */
type TwoStartPitcherBase = {
    game_date: string;
    team: string;
    opponent: string;
    home: boolean;
    player_id: number;
    normalised_name: string;
    accuracy: number;
    qs_likelihood_score: number;
    avg_qs_score: number;
};
export type TwoStartPitcher = TwoStartPitcherBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>>
    & { basic_reliability_score: number; }
    & { advanced_reliability_score: number; }

type ProbablePitcherBase = {
    game_date: string;
    team: string;
    opponent: string;
    home: boolean;
    player_id: number;
    normalised_name: string;
    accuracy: number;
    qs_likelihood_score: number;
};
export type ProbablePitcher = ProbablePitcherBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>>
    & { basic_reliability_score: number; }
    & { advanced_reliability_score: number; }

type WatchlistBase = {
    span_days: number;
    split_type: string;
};
type Watchlist = WatchlistBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;

export type HitterWatchlist = Watchlist 
    & Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${HitterBasicScoringFields}`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterBasicScoringFields}_pct`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterAdvancedScoringFields}_pct`, number>
    & { basic_reliability_score: number; }
    & { advanced_reliability_score: number; }

export type PitcherWatchlist = Watchlist 
    & Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>
    & { basic_reliability_score: number; }
    & { advanced_reliability_score: number; }

export type HitterScoringWatchlist = HitterWatchlist
    & {
        fantasy_score: number;
    };
export type HitterSpeedWatchlist = HitterWatchlist
    & {
        sb_pickup_score: number;
    };
export type HitterContactOnBaseWatchlist = HitterWatchlist
    & {
        contact_onbase_score: number;
    };
export type HitterPowerWatchlist = HitterWatchlist
    & {
        power_score: number;
    };
export type PitcherScoringWatchlist = PitcherWatchlist
    & {
        fantasy_score: number;
    };
export type PitcherStarterWatchlist = PitcherWatchlist
    & {
        k_qs_score: number;
    };
export type PitcherRelieverWatchlist = PitcherWatchlist
    & {
        leverage_relief_score: number;
    };

type ScheduleStrengthBase = {
    reliability_score: number;
};
export type PitcherScheduleStrength = ScheduleStrengthBase
    & {
        pitcher_week_score: number;
        qs_pct: number;
        sv_pct: number;
        hld_pct: number;
        opp_ops_vs_hand_pct: number;
        fip_pct: number;
        bb_per_9_pct: number;
        k_per_9_pct: number;
    }
    & Record<DefaultPlayerFields, string>;
export type HitterScheduleStrength = ScheduleStrengthBase
    & {
        hitter_week_score: number;
        player_id: number;
        games: number;
    }
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterAdvancedScoringFields}_pct`, number>;

type ScoringCategoryValue = {
    weighted_value: number;
    category_tier: number | null;
};
type ScoringCategoryStatsBase = {
    total_value: number;
    total_tier: number;
    reliability_score: number;
    risk_score: number;
};
export type PitcherScoringCategoryStats = ScoringCategoryStatsBase
    & Partial<Record<PitcherCategory, ScoringCategoryValue>>
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;

export type HitterScoringCategoryStats = ScoringCategoryStatsBase
    & Partial<Record<HitterCategory, ScoringCategoryValue>>
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;

export type PlayerScoringCategoryStats = ScoringCategoryStatsBase
    & Partial<Record<PitcherCategory | HitterCategory, ScoringCategoryValue>>
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;

type ScoringCategoryValueBase = {
    weighted_value: number;
    category_tier: number | null;
};
type PitcherScoringCategoryValueBase = ScoringCategoryValueBase
    & {
        category_code: PitcherCategory;
    };
type PitcherScoringCategoryValue = PitcherScoringCategoryValueBase
    & ScoringCategoryStatsBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;

type HitterScoringCategoryValueBase = ScoringCategoryValueBase
    & {
        category_code: HitterCategory;
    };
type HitterScoringCategoryValue = HitterScoringCategoryValueBase
    & ScoringCategoryStatsBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;
type PlayerScoringCategoryValueBase = ScoringCategoryValueBase
    & {
        category_code: PitcherCategory | HitterCategory;
    };
type PlayerScoringCategoryValue = PlayerScoringCategoryValueBase
    & ScoringCategoryStatsBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;


export type TeamScoringCategoryStats = {
    category_code: PitcherCategory | HitterCategory;
    total_value: number;
    league_avg: number;
    team_count: number;
    ranking: number;
};
export type TeamPositionValueStats = {
    slot_code: string;
    total_value: number;
    player_count: number;
    league_avg: number;
    ranking: number;
    team_count: number;
};

type NRFIRankingBase = {
    game_date: string;
    team: string;
    opponent: string;
    home: boolean;
    player_id: number;
    accuracy: number;
    nrfi_likelihood_score: number;
    team_nrfi_pct: number;
    opponent_nrfi_pct: number;
    player_nrfi_pct: number;
    avg_nrfi_score: number;
};
export type NRFIRanking = NRFIRankingBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>
    & { reliability_score: number; }

export type PlayerFantasyRankingBase = {
    span_days: number;
    split_type: string;
    batter_score: number;
    pitcher_score: number;
}
export type PlayerFantasyRanking = PlayerFantasyRankingBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${HitterBasicScoringFields}`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterBasicScoringFields}_pct`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterAdvancedScoringFields}_pct`, number>>
    & { reliability_score: number; }

export type SpanDays = 7 | 14 | 30;
export type PitcherOrBatter = 'P' | 'B';
export type Position = '1B' | '2B' | '3B' | 'SS' | 'C' | 'OF' | 'DH' | 'UTIL' | 'P' | 'SP' | 'RP';
export type WatchlistType = 'speed' | 'contact' | 'power' | 'starter' | 'reliever';

export type GameLogRow = {
    players_id: number;
    player_id: number;
    game_date: string;
    opponent: string | null;
    is_home: boolean | null;
    position: string | null;
    ab: number | null; h: number | null; r: number | null; rbi: number | null;
    hr: number | null; sb: number | null; bb: number | null; k: number | null;
    singles: number | null; doubles: number | null; triples: number | null; total_bases: number | null;
    ip: number | null; er: number | null; hits_allowed: number | null; walks_allowed: number | null;
    strikeouts: number | null; qs: number | null; sv: number | null; hld: number | null;
    nrfi: number | null; home_runs_allowed: number | null; batters_faced: number | null;
    fantasy_points: number | null;
};

export type SavantProfileRow = Record<string, unknown>;
export type AdvancedRollingRow = Record<string, unknown>;

export type MatchupContext = {
    game_date: string;
    home_or_away: 'home' | 'away' | null;
    opposing_starter: {
        name: string | null;
        season_era: number | null;
        season_whip: number | null;
        k_per_9: number | null;
        throws: string | null;
    } | null;
    opposing_team_split: {
        ops: number | null;
        k_rate: number | null;
        bb_rate: number | null;
        ops_pct: number | null;
        so_rate_pct: number | null;
        bb_rate_pct: number | null;
    } | null;
};

export type RecentSplits = {
    last_7: Record<string, unknown> | null;
    prior_7: Record<string, unknown> | null;
    last_14: Record<string, unknown> | null;
    last_30: Record<string, unknown> | null;
    trend: 'heating_up' | 'cooling' | 'steady';
};

export type StreakStatus = {
    hit_streak_games: number;
    on_base_streak_games: number;
    multi_hit_streak: number;
    scoreless_innings_streak: number;
    consecutive_quality_starts: number;
    games_since_last_hr: number;
    games_since_last_sb: number;
    last_active_game_date: string | null;
};

class Player {
    private db: QueryableDB;
    private defaultPlayerFields: string[];
    private pageSize: number;

    constructor(db: QueryableDB) {
        this.db = db;
        this.defaultPlayerFields = [
            'id', 'name', 'mlb_team', 'eligible_positions', 'selected_position', 'headshot_url'
        ];
        this.pageSize = 15;
    }

    getDefaultPlayerFields(): PlayerSelectScoringFields { 
        return {
            basic: [],
            advanced: [],
            raw: [],
        };
    }

    mergeScoringFields(...selectScoringFields: PlayerSelectScoringFields[]): PlayerSelectScoringFields {
        const basic = [...new Set(selectScoringFields.flatMap(field => field.basic))];
        const advanced = [...new Set(selectScoringFields.flatMap(field => field.advanced))];
        const raw = [...new Set(selectScoringFields.flatMap(field => field.raw))];
        return {
            basic: basic,
            advanced: advanced,
            raw: raw,
        };
    }

    getFields(selectScoringFields: PlayerSelectScoringFields): string[] {
        const scoringFields: string[] = [];
        scoringFields.push(...this.defaultPlayerFields.map(field => `${PLAYERS_TABLE_ALIAS}.${field}`));
        if (selectScoringFields.basic.length > 0) {
            scoringFields.push(...selectScoringFields.basic.map(field => `${BASIC_ROLLING_STATS_TABLE_ALIAS}.${field}`));
            scoringFields.push(...selectScoringFields.basic.map(field => `${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${field}_pct`));
            scoringFields.push(`${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score AS reliability_score`);
        }
        if (selectScoringFields.advanced.length > 0) {
            scoringFields.push(...selectScoringFields.advanced.map(field => `${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${field}_pct`));
        }
        if (selectScoringFields.raw.length > 0) {
            scoringFields.push(...selectScoringFields.raw.map(field => `${BASIC_ROLLING_STATS_TABLE_ALIAS}.${field}`));
        }
        return scoringFields;
    }

    getPitcherScoringFields(): PlayerSelectScoringFields {
        const basic = PITCHER_BASIC_SCORING_FIELDS.filter((f): f is PitcherBasicScoringFields => f !== 'ip');
        return {
            basic,
            advanced: [],
            raw: ['ip'],
        };
    }

    getPitcherAdvancedScoringFields(): PlayerSelectScoringFields {
        return {
            basic: [],
            advanced: [...PITCHER_ADVANCED_SCORING_FIELDS],
            raw: [],
        };
    }

    getHitterScoringFields(): PlayerSelectScoringFields {
        const basic = HITTER_BASIC_SCORING_FIELDS.filter((f): f is HitterBasicScoringFields => f !== 'hits' && f !== 'abs');
        return {
            basic,
            advanced: [],
            raw: ['hits', 'abs'],
        };
    }

    getHitterAdvancedScoringFields(): PlayerSelectScoringFields {
        return {
            basic: [],
            advanced: [...HITTER_ADVANCED_SCORING_FIELDS],
            raw: [],
        };
    }

    async getUserTeamId(): Promise<number | false> {
        try {
            const [[team]] = await this.db.query<LeagueTeam[]>(
                `SELECT id FROM ${TEAMS_TABLE} WHERE is_user_team = true LIMIT 1`
            );
            if (!team) {
                throw new Error('No user team found');
            }
            return team.id;            
        } catch (error) {
            console.error('Error getting user team id:', error);
            throw error;
        }
    }

    async getAvailableTwoStartPitchers(
        startDate: string,
        endDate: string,
        seasonYear: number = new Date().getFullYear()
    ): Promise<TwoStartPitcher[]> {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const pitcherScoringFields = this.mergeScoringFields(
            this.getPitcherScoringFields(),
            this.getPitcherAdvancedScoringFields()
        );
        const spanDays = 30;
        const [probablePitchers] = await this.db.query<TwoStartPitcher[]>(
            `SELECT 
                DATE_FORMAT(${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, '%Y-%m-%d') AS game_date, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.team AS team, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS opponent, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.home AS home, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id AS player_id,
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name AS normalised_name,
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.accuracy AS accuracy, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score AS qs_likelihood_score,
                AVG(${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score) OVER (PARTITION BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id) AS avg_qs_score,

                ${this.getFields(pitcherScoringFields).join(', ')}

            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ?
            WHERE
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND EXISTS (
                    SELECT 1
                    FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}2
                    LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}2
                        ON ${PLAYERS_TABLE_ALIAS}2.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}2.player_id
                    WHERE
                        ${PROBABLE_PITCHERS_TABLE_ALIAS}2.normalised_name = ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name
                        AND ${PLAYERS_TABLE_ALIAS}2.status = 'free_agent'
                        AND ${PROBABLE_PITCHERS_TABLE_ALIAS}2.game_date BETWEEN ? AND ?
                    HAVING COUNT(*) > 1
                )
            ORDER BY avg_qs_score DESC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name ASC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date ASC
            `,
            [spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, startDate, endDate, startDate, endDate]
        );
        return probablePitchers;
    }

    async getAvailableDailyStreamingPitchers(
        startDate: string,
        endDate: string,
        seasonYear: number = new Date().getFullYear()
    ): Promise<ProbablePitcher[]> {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const spanDays = 30;
        const pitcherScoringFields = this.mergeScoringFields(
            this.getPitcherScoringFields(),
            this.getPitcherAdvancedScoringFields()
        );
        const [probablePitchers] = await this.db.query<ProbablePitcher[]>(
            `SELECT 
                DATE_FORMAT(${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, '%Y-%m-%d') AS game_date, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.team AS team, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS opponent, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.home AS home, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id AS player_id, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name AS normalised_name, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.accuracy AS accuracy, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score AS qs_likelihood_score,

                ${this.getFields(pitcherScoringFields).join(', ')}
                
            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ?
            WHERE
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND ${PLAYERS_TABLE_ALIAS}.status = 'free_agent'
            ORDER BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score DESC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name
            `,
            [spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, startDate, endDate]
        );
        return probablePitchers;
    }

    async getTwoStartPitchersForTeam(
        teamId: number, 
        startDate: string, 
        endDate: string
    ): Promise<TwoStartPitcher[]> {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const defaultPlayerFields = this.getDefaultPlayerFields();
        const [probablePitchers] = await this.db.query<TwoStartPitcher[]>(
            `SELECT 
                DATE_FORMAT(${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, '%Y-%m-%d') AS game_date, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.team AS team, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS opponent, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.home AS home, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id AS player_id, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name AS normalised_name,
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.accuracy AS accuracy, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score AS qs_likelihood_score,
                AVG(${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score) OVER (PARTITION BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id) AS avg_qs_score,

                ${this.getFields(defaultPlayerFields).join(', ')}
            
                FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            WHERE 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND EXISTS (
                    SELECT 1    
                    FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}2
                    LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}2 
                        ON ${PLAYERS_TABLE_ALIAS}2.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}2.player_id
                    WHERE 
                        ${PROBABLE_PITCHERS_TABLE_ALIAS}2.normalised_name = ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name
                        AND ${PLAYERS_TABLE_ALIAS}2.team_id = ?
                        AND ${PLAYERS_TABLE_ALIAS}2.position = 'P'
                        AND ${PROBABLE_PITCHERS_TABLE_ALIAS}2.game_date BETWEEN ? AND ?
                    HAVING COUNT(*) > 1
                )
            ORDER BY avg_qs_score DESC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name ASC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date ASC
            `,
            [startDate, endDate, teamId, startDate, endDate]
        );
        return probablePitchers;
    }

    async getProbablePitchersForTeam(
        teamId: number, 
        startDate: string, 
        endDate: string
    ): Promise<ProbablePitcher[]> {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        const defaultPlayerFields = this.getDefaultPlayerFields();
        const [probablePitchers] = await this.db.query<ProbablePitcher[]>(
            `SELECT 
                DATE_FORMAT(${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, '%Y-%m-%d') AS game_date, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.team AS team, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS opponent, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.home AS home, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id AS player_id,
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name AS normalised_name,
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.accuracy AS accuracy, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score AS qs_likelihood_score,

                ${this.getFields(defaultPlayerFields).join(', ')}
            
            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            WHERE 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
                AND ${PLAYERS_TABLE_ALIAS}.team_id = ?
            ORDER BY 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date ASC, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score DESC, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name ASC
            `,
            [startDate, endDate, teamId]
        );
        return probablePitchers;
    }

    async getScoringStatsForTeamBatters(
        teamId: number,
        spanDays: SpanDays = 14,
        orderBy: HitterBasicScoringFields | HitterAdvancedScoringFields | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<HitterScoringWatchlist[]> {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        const scoringFields = this.mergeScoringFields(
            this.getHitterScoringFields(), 
            this.getHitterAdvancedScoringFields()
        );
        let orderByClause = '';
        if (orderBy) {
            if (!HITTER_ORDER_BY_ALLOWED.has(orderBy)) {
                throw new Error('Invalid orderBy parameter');
            }
            orderByClause = `ORDER BY ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${orderBy}_pct DESC`;
        }
        const runs_weight = 0.15;
        const hr_weight = 0.25;
        const rbi_weight = 0.25;
        const sb_weight = 0.25;
        const avg_weight = 0.10;
        const [playerStats] = await this.db.query<HitterScoringWatchlist[]>(
            `SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* Batter fantasy score: All 5 hitting categories */
                (${runs_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.runs_pct
                + ${hr_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hr_pct
                + ${rbi_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.rbi_pct
                + ${sb_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sb_pct
                + ${avg_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.avg_pct) AS fantasy_score

            FROM ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            WHERE
                ${PLAYERS_TABLE_ALIAS}.team_id = ?
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            ${orderByClause}
            `,
            [spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, teamId]
        );
        return playerStats;
    }

    async getScoringStatsForTeamPitchers(
        teamId: number,
        spanDays: SpanDays = 14,
        orderBy: PitcherBasicScoringFields | PitcherAdvancedScoringFields | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<PitcherScoringWatchlist[]> {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        const scoringFields = this.mergeScoringFields(
            this.getPitcherScoringFields(), 
            this.getPitcherAdvancedScoringFields()
        );
        let orderByClause = '';
        if (orderBy) {
            if (!PITCHER_ORDER_BY_ALLOWED.has(orderBy)) {
                throw new Error('Invalid orderBy parameter');
            }
            orderByClause = `ORDER BY ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${orderBy}_pct DESC`;
        }
        const strikeouts_weight = 0.25;
        const qs_weight = 0.25;
        const svh_weight = 0.20;
        const era_weight = 0.15;
        const whip_weight = 0.15;
        const [playerStats] = await this.db.query<PitcherScoringWatchlist[]>(
            `SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* Pitcher fantasy score: K, QS, SVH heavy, with ERA/WHIP control */
                (${strikeouts_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.strikeouts_pct
                + ${qs_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.qs_pct
                + ${svh_weight} * GREATEST(${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sv_pct, ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hld_pct)
                + ${era_weight} * (100 - ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.era_pct)
                + ${whip_weight} * (100 - ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.whip_pct)) AS fantasy_score

            FROM ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            WHERE
                ${PLAYERS_TABLE_ALIAS}.team_id = ? AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
            ${orderByClause}
            `,
            [spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, teamId]
        );
        return playerStats;
    }

    async getWeeklyPitcherScheduleStrengthPreviewForTeam(
        teamId: number,
        startDate: string,
        endDate: string,
        spanDays: SpanDays = 14,
        seasonYear: number = new Date().getFullYear()
    ): Promise<PitcherScheduleStrength[]> {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        return executeInTransaction(async (connection) => {
            const outerPlayerFields = this.defaultPlayerFields.map(field => `ANY_VALUE(${field}) AS ${field}`).join(', ');
            const innerPlayerFields = this.getDefaultPlayerFields();
            const teamVsPitcherWeight = 0.45;
            const fipWeight = 0.25;
            const qsWeight = 0.20;
            const bbPer9Weight = 0.10;
            const homeWeight = 3;
            const [pitcherScores] = await connection.query(`
                SELECT 
                    ${outerPlayerFields}, 
                    AVG(start_score) AS pitcher_week_score, 
                    COUNT(*) AS starts, 
                    MAX(qs_pct) AS qs_pct, 
                    MAX(sv_pct) AS sv_pct, 
                    MAX(hld_pct) AS hld_pct, 
                    100 - AVG(opp_ops_vs_hand_pct) AS opp_ops_vs_hand_pct,
                    MAX(fip_pct) AS fip_pct, 
                    MAX(bb_per_9_pct) AS bb_per_9_pct, 
                    MAX(k_per_9_pct) AS k_per_9_pct, 
                    MAX(reliability_score) AS reliability_score
                    FROM (
                        SELECT
                            ${this.getFields(innerPlayerFields).join(', ')}, 
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.team,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.home,
                            ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}.ops_pct     AS opp_ops_vs_hand_pct,
                            ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.fip_pct,
                            ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.qs_pct,
                            ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sv_pct,
                            ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hld_pct,
                            ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.bb_per_9_pct,
                            ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.k_per_9_pct,
                            ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score,

                            /* start_score formula - handle NULLs gracefully */
                            (${teamVsPitcherWeight}*(100 - COALESCE(${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}.ops_pct, 50))  -- Default to 50 if missing
                                + ${fipWeight}*COALESCE(${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.fip_pct, 50)    -- Default to 50 if missing
                                + ${qsWeight}*COALESCE(${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.qs_pct, 50)      -- Default to 50 if missing
                                + ${bbPer9Weight}*(100 - COALESCE(${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.bb_per_9_pct, 50))  -- Default to 50 if missing
                                + CASE WHEN ${PROBABLE_PITCHERS_TABLE_ALIAS}.home THEN ${homeWeight} ELSE 0 END) AS start_score

                        FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
                        JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                            ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                            AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
                        JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                            ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                            AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'P'
                        LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                            ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                            AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                            AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                            AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                            AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                        LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                            ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                            AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                            AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                            AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                            AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                        LEFT JOIN ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE} ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}
                            ON ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}.team = ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent
                            AND ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}.throws = ${PLAYER_LOOKUPS_TABLE_ALIAS}.throws
                            AND ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                            AND ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                        WHERE
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                            AND ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id IS NOT NULL
                            AND ${PLAYERS_TABLE_ALIAS}.team_id = ?
                        ) ${PROBABLE_PITCHERS_TABLE_ALIAS}
                    GROUP BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                    ORDER BY pitcher_week_score DESC
                `, [spanDays, 'overall', seasonYear, spanDays, 'overall', seasonYear, spanDays, seasonYear, startDate, endDate, teamId]);
            return pitcherScores as PitcherScheduleStrength[];
        });
    }

    async getWeeklyHitterScheduleStrengthPreviewForTeam(
        teamId: number | false,
        startDate: string,
        endDate: string,
        spanDays: SpanDays = 14,
        seasonYear: number = new Date().getFullYear()
    ): Promise<HitterScheduleStrength[]> {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        return executeInTransaction(async (connection) => {
            // Create temporary table for hitter analysis
            await connection.query(`
                CREATE TEMPORARY TABLE IF NOT EXISTS temp_opponents (
                    player_id     INT NOT NULL,
                    opponent_team VARCHAR(10) NOT NULL,
                    games         INT NOT NULL,
                    home_games    INT NOT NULL,
                    away_games    INT NOT NULL,
                    PRIMARY KEY (player_id, opponent_team)
                ) ENGINE=MEMORY;
            `);

            // Clear the temporary table
            await connection.query(`
                TRUNCATE TABLE temp_opponents;
            `);
            
            // Insert hitter data into temporary table
            await connection.query(`
                INSERT INTO temp_opponents (player_id, opponent_team, games, home_games, away_games)
                SELECT
                    d.player_id,
                    d.opp_team AS opponent_team,
                    COUNT(*) AS games,
                    SUM(CASE WHEN d.our_home = 1 THEN 1 ELSE 0 END) AS home_games,
                    SUM(CASE WHEN d.our_home = 1 THEN 0 ELSE 1 END) AS away_games
                FROM (
                    /* De-dupe by a synthetic game key so we don't double count when both probables are listed */
                    SELECT DISTINCT
                        g.player_id,
                        g.game_date,
                        COALESCE(g.game_id, CONCAT(g.game_date, ':', g.our_team, '@', g.opp_team)) AS gid_key,
                        g.opp_team,
                        g.our_home
                    FROM (
                        /* Case A: our team appears as 'team' */
                        SELECT
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_id,
                            ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.team     AS our_team,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS opp_team,
                            CASE WHEN ${PROBABLE_PITCHERS_TABLE_ALIAS}.home = 1 THEN 1 ELSE 0 END AS our_home
                        FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
                        JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                            ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.team = ${PROBABLE_PITCHERS_TABLE_ALIAS}.team 
                            AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'B'
                        JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                            ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id 
                            AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
                        WHERE ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                            AND ${PLAYERS_TABLE_ALIAS}.team_id = ?

                        UNION ALL

                        /* Case B: only opponent has a probable; mirror it */
                        SELECT
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_id,
                            ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS our_team,
                            ${PROBABLE_PITCHERS_TABLE_ALIAS}.team     AS opp_team,
                            CASE WHEN ${PROBABLE_PITCHERS_TABLE_ALIAS}.home = 1 THEN 0 ELSE 1 END AS our_home
                        FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
                        JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                            ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.team = ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent 
                            AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'B'
                        JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                            ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id 
                            AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
                        WHERE ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                            AND ${PLAYERS_TABLE_ALIAS}.team_id = ?
                    ) AS g
                ) AS d
                GROUP BY d.player_id, d.opp_team;
            `, [startDate, endDate, teamId, startDate, endDate, teamId]);

            // Query the aggregated results from temporary table
            // getFields() always prepends p.* — merge once so we do not duplicate player columns.
            // ANY_VALUE(...) satisfies ONLY_FULL_GROUP_BY: p.* and pars_pct.* are constant per t.player_id given the joins.
            const hitterScheduleFields = this.mergeScoringFields(
                this.getDefaultPlayerFields(),
                this.getHitterAdvancedScoringFields(),
            );
            const anyValuePlayerAndAdvanced = this.getFields(hitterScheduleFields)
                .map((col) => {
                    const alias = col.includes('.') ? col.split('.').pop() as string : col;
                    return `ANY_VALUE(${col}) AS \`${alias}\``;
                })
                .join(', ');
            const [hitterScores] = await connection.query(`
                SELECT
                    ${anyValuePlayerAndAdvanced},
                    ANY_VALUE(${PLAYERS_TABLE_ALIAS}.player_id) AS player_id,
                    SUM(t.games) AS games,
                    ANY_VALUE(${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score) AS reliability_score,
                    SUM(t.games * (
                        0.50*(100 - ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.whip_pct)
                        + 0.30*(100 - ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.fip_pct)
                        + 0.20*(100 - ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS}.ops_pct)
                    )) / NULLIF(SUM(t.games),0) AS hitter_week_score
                FROM temp_opponents t
                JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                    ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = t.player_id 
                    AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'B'
                JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                    ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id 
                    AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
                JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                    ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = t.player_id
                    AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                    AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                    AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                    AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                JOIN ${TEAM_ROLLING_STATS_PERCENTILES_TABLE} ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                    ON ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.team = t.opponent_team
                    AND ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                    AND ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                    AND ${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                JOIN ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE} ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS}
                    ON ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS}.team = t.opponent_team
                    AND ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS}.bats = ${PLAYER_LOOKUPS_TABLE_ALIAS}.bats
                    AND ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                    AND ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                GROUP BY t.player_id
                ORDER BY hitter_week_score DESC;
            `, [spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear]);

            // Drop the temporary table
            await connection.query(`
                DROP TABLE temp_opponents;
            `);
            
            return hitterScores as HitterScheduleStrength[];
        });
    }

    async getScoringCategoryStatsForTeamPitchers(
        teamId: number,
        modelId: number,
        spanDays: SpanDays = 14
    ): Promise<PitcherScoringCategoryStats[]> {
        if (!teamId) { 
            throw new Error('Team ID is required');
        }
        if (!modelId) {
            throw new Error('Model ID is required');
        }

        const defaultPlayerFields = this.getDefaultPlayerFields();

        const [pitcherScoringCategoryValues] = await this.db.query<PitcherScoringCategoryValue[]>(`
            SELECT
                ${this.getFields(defaultPlayerFields).join(', ')},
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.total_value,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.tier AS total_tier,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.reliability_score,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.risk_score,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.category_code,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.weighted_value,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.tier AS category_tier
            FROM ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
            JOIN ${PLAYER_VALUE_SNAPSHOTS_TABLE} ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}
                ON ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.player_pk = ${PLAYERS_TABLE_ALIAS}.id
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.model_id = ?
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.span_days = ?
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.split_type = 'overall'
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.position = 'P'
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.as_of_date = (
                    SELECT MAX(as_of_date)
                    FROM ${PLAYER_VALUE_SNAPSHOTS_TABLE}
                    WHERE model_id = ?
                    AND span_days = ?
                    AND split_type = 'overall'
                    AND position = 'P'
                )
            LEFT JOIN ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE} ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}
                ON ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.player_pk = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.player_pk
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.model_id = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.model_id
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.span_days = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.span_days
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.split_type = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.split_type
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.as_of_date = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.as_of_date
            WHERE ${PLAYERS_TABLE_ALIAS}.team_id = ?
            ORDER BY ${PLAYERS_TABLE_ALIAS}.id, ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.category_code;
            `, [modelId, spanDays, modelId, spanDays, teamId]);

        const pitcherScoringCategoryStats = this.flattenScoringCategoryStatsForPlayers(pitcherScoringCategoryValues) as unknown as PitcherScoringCategoryStats[];

        return pitcherScoringCategoryStats;
    }

    async getScoringCategoryStatsForTeamHitters(
        teamId: number,
        modelId: number,
        spanDays: SpanDays = 14
    ): Promise<HitterScoringCategoryStats[]> {
        if (!teamId) { 
            throw new Error('Team ID is required');
        }
        if (!modelId) {
            throw new Error('Model ID is required');
        }

        const defaultPlayerFields = this.getDefaultPlayerFields();

        const [hitterScoringCategoryValues] = await this.db.query<HitterScoringCategoryValue[]>(`
            SELECT
                ${this.getFields(defaultPlayerFields).join(', ')},
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.total_value,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.tier AS total_tier,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.reliability_score,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.risk_score,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.category_code,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.weighted_value,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.tier AS category_tier
            FROM ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
            JOIN ${PLAYER_VALUE_SNAPSHOTS_TABLE} ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}
                ON ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.player_pk = ${PLAYERS_TABLE_ALIAS}.id
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.model_id = ?
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.span_days = ?
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.split_type = 'overall'
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.position = 'B'
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.as_of_date = (
                    SELECT MAX(as_of_date)
                    FROM ${PLAYER_VALUE_SNAPSHOTS_TABLE}
                    WHERE model_id = ?
                    AND span_days = ?
                    AND split_type = 'overall'
                    AND position = 'B'
                )
            LEFT JOIN ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE} ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}
                ON ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.player_pk = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.player_pk
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.model_id = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.model_id
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.span_days = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.span_days
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.split_type = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.split_type
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.as_of_date = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.as_of_date
            WHERE ${PLAYERS_TABLE_ALIAS}.team_id = ?
            ORDER BY ${PLAYERS_TABLE_ALIAS}.id, ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.category_code;
            `, [modelId, spanDays, modelId, spanDays, teamId]);

        const hitterScoringCategoryStats = this.flattenScoringCategoryStatsForPlayers(hitterScoringCategoryValues) as unknown as HitterScoringCategoryStats[];

        return hitterScoringCategoryStats;
    }

    async getScoringCategoryStatsForPlayers(
        playerIds: number[],
        modelId: number,
        spanDays: SpanDays = 14,
    ): Promise<PlayerScoringCategoryStats[]> {
        if (!playerIds?.length) {
            throw new Error('Player IDs are required');
        }
        if (!modelId) {
            throw new Error('Model ID is required');
        }
        if (!spanDays) {
            throw new Error('Span days are required');
        }

        const defaultPlayerFields = this.getDefaultPlayerFields();

        const [playerScoringCategoryValues] = await this.db.query<PlayerScoringCategoryValue[]>(`
            SELECT
                ${this.getFields(defaultPlayerFields).join(', ')},
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.total_value,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.tier AS total_tier,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.reliability_score,
                ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.risk_score,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.category_code,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.weighted_value,
                ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.tier AS category_tier
            FROM ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
            JOIN ${PLAYER_VALUE_SNAPSHOTS_TABLE} ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}
                ON ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.player_pk = ${PLAYERS_TABLE_ALIAS}.id
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.model_id = ?
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.span_days = ?
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.split_type = 'overall'
                AND ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.as_of_date = (
                    SELECT MAX(as_of_date)
                    FROM ${PLAYER_VALUE_SNAPSHOTS_TABLE}
                    WHERE model_id = ?
                    AND span_days = ?
                    AND split_type = 'overall'
                )
            LEFT JOIN ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE} ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}
                ON ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.player_pk = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.player_pk
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.model_id = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.model_id
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.span_days = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.span_days
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.split_type = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.split_type
                AND ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.as_of_date = ${PLAYER_VALUE_SNAPSHOTS_TABLE_ALIAS}.as_of_date
            WHERE ${PLAYERS_TABLE_ALIAS}.id IN (?)
            ORDER BY ${PLAYERS_TABLE_ALIAS}.id, ${PLAYER_VALUE_SNAPSHOT_COMPONENTS_TABLE_ALIAS}.category_code;
            `, [modelId, spanDays, modelId, spanDays, playerIds]);

        const playerScoringCategoryStats = this.flattenScoringCategoryStatsForPlayers(playerScoringCategoryValues) as unknown as PlayerScoringCategoryStats[];

        return playerScoringCategoryStats;
    }

    flattenScoringCategoryStatsForPlayers(scoringCategoryValues: HitterScoringCategoryValue[] | PitcherScoringCategoryValue[] | PlayerScoringCategoryValue[] ): HitterScoringCategoryStats[] | PitcherScoringCategoryStats[] | PlayerScoringCategoryStats[] {
        // Group flat rows (one per player per category) into one row per player with categories as keys.
        // mysql2 may return column names as "id"/"name" (unqualified) or "p.id"/"p.name" (qualified); support both.
        const byPlayer = new Map<number, HitterScoringCategoryStats | PitcherScoringCategoryStats | PlayerScoringCategoryStats>();

        for (const row of scoringCategoryValues) {
            const rowAny = row as Record<string, unknown>;
            const id = Number(rowAny[`${PLAYERS_TABLE_ALIAS}.id`] ?? rowAny['id']);
            if (Number.isNaN(id)) continue;

            if (!byPlayer.has(id)) {
                const base: Record<string, unknown> = {};
                for (const f of this.defaultPlayerFields) {
                    const prefixed = `${PLAYERS_TABLE_ALIAS}.${f}`;
                    base[prefixed] = rowAny[prefixed] ?? rowAny[f];
                }
                base.total_value = rowAny.total_value;
                base.total_tier = rowAny.total_tier;
                base.reliability_score = rowAny.reliability_score;
                base.risk_score = rowAny.risk_score;
                byPlayer.set(id, base as HitterScoringCategoryStats | PitcherScoringCategoryStats | PlayerScoringCategoryStats);
            }
            const out = byPlayer.get(id) as Record<string, unknown>;
            const code = row.category_code;
            if (code != null && String(code).trim() !== '') {
                out[code] = {
                    weighted_value: Number(row.weighted_value),
                    category_tier: row.category_tier != null ? Number(row.category_tier) : null,
                };
            }
        }

        return Array.from(byPlayer.values()) as HitterScoringCategoryStats[] | PitcherScoringCategoryStats[] | PlayerScoringCategoryStats[];
    }

    async getScoringCategoryStatsForTeam(
        leagueId: number,
        teamId: number,
        modelId: number,
        spanDays: SpanDays = 14
    ): Promise<TeamScoringCategoryStats[]> {
        if (!leagueId) {
            throw new Error('League ID is required');
        }
        if (!teamId) {
            throw new Error('Team ID is required');
        }
        if (!modelId) {
            throw new Error('Model ID is required');
        }

        const [teamScoringCategoryStats] = await this.db.query<TeamScoringCategoryStats[]>(`
            SELECT
                category_code,
                total_value,
                league_avg,
                team_count,
                ranking
            FROM ${TEAM_VALUE_SNAPSHOT_CATEGORY_TOTALS_TABLE}
            WHERE league_id = ?
                AND team_id = ?
                AND model_id = ?
                AND span_days = ?
                AND split_type = 'overall'
                AND as_of_date = (
                    SELECT MAX(as_of_date)
                    FROM ${TEAM_VALUE_SNAPSHOT_CATEGORY_TOTALS_TABLE}
                    WHERE league_id = ?
                        AND model_id = ?
                        AND span_days = ?
                        AND split_type = 'overall'
            )
            ORDER BY category_code;
        `, [leagueId, teamId, modelId, spanDays, leagueId, modelId, spanDays]);

        return teamScoringCategoryStats as TeamScoringCategoryStats[];
    }

    async getPositionValueStatsForTeam(
        leagueId: number,
        teamId: number,
        modelId: number,
        spanDays: SpanDays = 14
    ): Promise<TeamPositionValueStats[]> {
        if (!leagueId) {
            throw new Error('League ID is required');
        }
        if (!teamId) {
            throw new Error('Team ID is required');
        }
        if (!modelId) {
            throw new Error('Model ID is required');
        }
        
        const [teamPositionValueStats] = await this.db.query<TeamPositionValueStats[]>(`
            SELECT
                slot_code,
                total_value,
                player_count,
                league_avg,
                team_count,
                ranking
            FROM ${TEAM_VALUE_SNAPSHOT_POSITION_TOTALS_TABLE}
            WHERE league_id = ?
                AND team_id = ?
                AND model_id = ?
                AND span_days = ?
                AND split_type = 'overall'
                AND as_of_date = (
                    SELECT MAX(as_of_date)
                    FROM ${TEAM_VALUE_SNAPSHOT_POSITION_TOTALS_TABLE}
                    WHERE league_id = ?
                        AND model_id = ?
                        AND span_days = ?
                        AND split_type = 'overall'
            )
            ORDER BY slot_code;
        `, [leagueId, teamId, modelId, spanDays, leagueId, modelId, spanDays]);

        return teamPositionValueStats as TeamPositionValueStats[];
    }


    async getHitterSpeedWatchlist(
        page: number = 1,
        spanDays: SpanDays = 14,
        position: Position | false = false,
        teamId: number | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<HitterSpeedWatchlist[]> {
        const positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const scoringFields = this.mergeScoringFields(
            this.getHitterScoringFields(), 
            this.getHitterAdvancedScoringFields()
        );
        const sb_weight = 1.00;
        const obp_weight = 0.35;
        const avg_weight = 0.25;
        const k_rate_weight = 0.30;
        const runs_weight = 0.20;

        const [hitterScores] = await this.db.query<HitterSpeedWatchlist[]>(`
            SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* score: SB heavy, OBP/contact support, light AVG, penalise K% */
                (${sb_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sb_pct 
                + ${obp_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.obp_pct 
                + ${avg_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.avg_pct
                - ${k_rate_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.k_rate_pct
                + ${runs_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.runs_pct ) AS sb_pickup_score

            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
            JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'B'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            WHERE
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY sb_pickup_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', seasonYear, minAbs, playerFilterValue, this.pageSize, offset]);
        return hitterScores;
    }

    async getHitterContactOnBaseWatchlist(
        page: number = 1,
        spanDays: SpanDays = 14,
        position: Position | false = false,
        teamId: number | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<HitterContactOnBaseWatchlist[]> {
        const positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const scoringFields = this.mergeScoringFields(
            this.getHitterScoringFields(), 
            this.getHitterAdvancedScoringFields()
        );
        const avg_weight = 0.60;
        const obp_weight = 0.45;
        const bb_rate_weight = 0.25;
        const k_rate_weight = 0.30;

        const [hitterScores] = await this.db.query<HitterContactOnBaseWatchlist[]>(`
            SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* score: AVG heavy, OBP/contact support, penalise K% */
                (${avg_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.avg_pct
                + ${obp_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.obp_pct
                + ${bb_rate_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.bb_rate_pct
                - ${k_rate_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.k_rate_pct) AS contact_onbase_score

            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
            JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'B'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            WHERE
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY contact_onbase_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', seasonYear, minAbs, playerFilterValue, this.pageSize, offset]);
        return hitterScores;
    }

    async getHitterPowerWatchlist(
        page: number = 1,
        spanDays: SpanDays = 14,
        position: Position | false = false,
        teamId: number | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<HitterPowerWatchlist[]> {
        const positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const offset = (page - 1) * this.pageSize;
        const minAbs = 15;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const scoringFields = this.mergeScoringFields(
            this.getHitterScoringFields(), 
            this.getHitterAdvancedScoringFields()
        );
        const hr_weight = 0.70;
        const iso_weight = 0.40;
        const slg_weight = 0.35;
        const k_rate_weight = 0.20;
        const rbi_weight = 0.15;
        const [hitterScores] = await this.db.query<HitterPowerWatchlist[]>(`
            SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* score: HR heavy, ISO/SLG support, penalise K%, reward RBI */
                (${hr_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hr_pct
                + ${iso_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.iso_pct
                + ${slg_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.slg_pct
                - ${k_rate_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.k_rate_pct
                + ${rbi_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.rbi_pct) AS power_score

            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
            JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'B'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            WHERE
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY power_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', seasonYear, minAbs, playerFilterValue, this.pageSize, offset]);
        return hitterScores;
    }

    async getPitcherStarterWatchlist(
        page: number = 1,
        spanDays: SpanDays = 14,
        teamId: number | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<PitcherStarterWatchlist[]> {
        const offset = (page - 1) * this.pageSize;
        const minIp = 6;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const scoringFields = this.mergeScoringFields(
            this.getPitcherScoringFields(), 
            this.getPitcherAdvancedScoringFields()
        );
        const k_per_9_weight = 0.45;
        const bb_per_9_weight = 0.30;
        const qs_weight = 0.30;
        const fip_weight = 0.25;
        const whip_weight = 0.15;
        const era_weight = 0.10;
        const [starterScores] = await this.db.query<PitcherStarterWatchlist[]>(`
            SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* score: K heavy, QS support, penalise BB, reward FIP/WHIP/ERA */
                (${k_per_9_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.k_per_9_pct
                - ${bb_per_9_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.bb_per_9_pct
                + ${qs_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.qs_pct
                + ${fip_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.fip_pct
                + ${whip_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.whip_pct
                + ${era_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.era_pct) AS k_qs_score

            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
            JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
            WHERE
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.ip >= ?
                ${playerFilter}
            ORDER BY k_qs_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', seasonYear, minIp, playerFilterValue, this.pageSize, offset]);
        return starterScores;
    }

    async getPitcherRelieverWatchlist(
        page: number = 1,
        spanDays: SpanDays = 14,
        teamId: number | false = false,
        seasonYear: number = new Date().getFullYear()
    ): Promise<PitcherRelieverWatchlist[]> {
        const offset = (page - 1) * this.pageSize;
        const minIp = 4;
        const playerFilter = teamId ? `AND p.team_id = ?` : `AND p.status = ?`;
        const playerFilterValue = teamId ? teamId : 'free_agent';
        const scoringFields = this.mergeScoringFields(
            this.getPitcherScoringFields(), 
            this.getPitcherAdvancedScoringFields()
        );
        const svh_weight = 0.55;
        const k_per_9_weight = 0.25;
        const whip_weight = 0.15;
        const fip_weight = 0.20;
        const bb_per_9_weight = 0.20;
        const [relieverScores] = await this.db.query<PitcherRelieverWatchlist[]>(`
            SELECT 
                ${this.getFields(scoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type,

                /* score: SV/HLD heavy, K heavy, penalise BB, reward FIP/WHIP */
                (${svh_weight} * GREATEST(${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sv_pct, ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hld_pct)
                    + ${k_per_9_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.k_per_9_pct
                    + ${whip_weight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.whip_pct
                    + ${fip_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.fip_pct
                    - ${bb_per_9_weight} * ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.bb_per_9_pct) AS leverage_relief_score

            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
            JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
            WHERE
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 55
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.ip >= ?
                ${playerFilter}
            ORDER BY leverage_relief_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', seasonYear, minIp, playerFilterValue, this.pageSize, offset]);
        return relieverScores;
    }

    async getPlayerFantasyRankings(
        page: number = 1,
        spanDays: SpanDays = 14,
        batterOrPitcher: PitcherOrBatter = 'B',
        isRostered: boolean = false,
        position: Position | false = false,
        orderBy: PlayerScoringFields | PlayerAdvancedScoringFields | false = false,
        teamId: number | false = false,
        seasonYear: number = new Date().getFullYear(),
        playerIdFilter: number[] = [],
    ): Promise<PlayerFantasyRanking[]> {
        const playerFields: PlayerSelectScoringFields = this.getDefaultPlayerFields();
        const scoringFields: PlayerSelectScoringFields = batterOrPitcher === 'B' ? this.getHitterScoringFields() : this.getPitcherScoringFields();
        const advancedScoringFields: PlayerSelectScoringFields = batterOrPitcher === 'B' ? this.getHitterAdvancedScoringFields() : this.getPitcherAdvancedScoringFields();

        const filters: string[] = [];
        const params: (string | number)[] = [batterOrPitcher, spanDays, 'overall', batterOrPitcher, batterOrPitcher, spanDays, 'overall', batterOrPitcher, seasonYear];
        const orderByClauses: string[] = [];

        if ( orderBy ) {
            if (( batterOrPitcher === 'B' && !HITTER_ORDER_BY_ALLOWED.has(orderBy)) || (batterOrPitcher === 'P' && !PITCHER_ORDER_BY_ALLOWED.has(orderBy))) {
                throw new Error('Invalid orderBy parameter');
            }
            orderByClauses.push(`${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${orderBy}_pct DESC`);
        }

        if ( batterOrPitcher === 'B' ) {
            filters.push(`${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?`);
            params.push(15);
            orderByClauses.push('batter_score DESC');
        } else {
            filters.push(`${BASIC_ROLLING_STATS_TABLE_ALIAS}.ip >= ?`);
            params.push(4);
            orderByClauses.push('pitcher_score DESC');
        }

        if ( ! isRostered ) {
            filters.push(`${PLAYERS_TABLE_ALIAS}.status = ?`);
            params.push('free_agent');
        }

        if ( position ) {
            filters.push(`${PLAYERS_TABLE_ALIAS}.is_${position.toLowerCase()} = ?`);
            params.push(1);
        }

        if ( teamId ) {
            filters.push(`${PLAYERS_TABLE_ALIAS}.team_id = ?`);
            params.push(teamId);
        }

        if ( playerIdFilter.length > 0 ) {
            const placeholders = playerIdFilter.map(() => '?').join(', ');
            filters.push(`${PLAYERS_TABLE_ALIAS}.id IN (${placeholders})`);
            params.push(...playerIdFilter);
        }

        const offset = (page - 1) * this.pageSize;
        params.push(this.pageSize, offset);
        
        const runsWeight = 0.15;
        const hrWeight = 0.25;
        const rbiWeight = 0.25;
        const sbWeight = 0.25;
        const avgWeight = 0.10;

        const strikeoutsWeight = 0.25;
        const qsWeight = 0.25;
        const svhWeight = 0.20;
        const eraWeight = 0.15;
        const whipWeight = 0.15;

        const sqlQuery = `
            SELECT 
                ${this.getFields(playerFields).join(', ')}, 
                ${this.getFields(scoringFields).join(', ')},
                ${this.getFields(advancedScoringFields).join(', ')},
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days AS span_days,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type AS split_type,

                /* Batter fantasy score: All 5 hitting categories */
                (${runsWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.runs_pct + 
                ${hrWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hr_pct + 
                ${rbiWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.rbi_pct + 
                ${sbWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sb_pct + 
                ${avgWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.avg_pct) AS batter_score,

                /* Pitcher fantasy score: K, QS, SVH heavy, with ERA/WHIP control */
                (${strikeoutsWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.strikeouts_pct + 
                ${qsWeight} * ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.qs_pct + 
                ${svhWeight} * GREATEST(${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sv_pct, ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hld_pct) + 
                ${eraWeight} * (100 - ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.era_pct) + 
                ${whipWeight} * (100 - ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.whip_pct)) AS pitcher_score
                
            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
            JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = ?
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = ?
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS}
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
                AND ${PLAYERS_TABLE_ALIAS}.position = ?
            WHERE
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
                ${filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''}
            ORDER BY ${orderByClauses.join(', ')}
            LIMIT ? OFFSET ?;
        `;

        const [playerRankings] = await this.db.query<PlayerFantasyRanking[]>(sqlQuery, params);
        return playerRankings;
    }

    async getNRFIRankings(startDate: string, endDate: string, seasonYear: number = new Date().getFullYear()): Promise<NRFIRanking[]> {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        console.log(`getNRFIRankings - startDate: ${startDate}, endDate: ${endDate}`);
        const spanDays = 30;
        const defaultPlayerFields = this.getDefaultPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const [nrfiRankings] = await this.db.query<NRFIRanking[]>(`
            SELECT 
                DATE_FORMAT(${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, '%Y-%m-%d') AS game_date, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.team AS team, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent AS opponent, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.home AS home, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id AS player_id, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.accuracy AS accuracy, 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.nrfi_likelihood_score AS nrfi_likelihood_score,
                team_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.nrfi_pct AS team_nrfi_pct,
                opponent_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.nrfi_pct AS opponent_nrfi_pct,
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.nrfi_pct AS player_nrfi_pct,
                AVG(${PROBABLE_PITCHERS_TABLE_ALIAS}.nrfi_likelihood_score) OVER (PARTITION BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_id) AS avg_nrfi_score,

                ${this.getFields(defaultPlayerFields).join(', ')}, 
                ${this.getFields(pitcherScoringFields).join(', ')},
                ${this.getFields(pitcherAdvancedScoringFields).join(', ')}

            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${PLAYER_LOOKUPS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.season_year = ?
            RIGHT JOIN ${TEAM_ROLLING_STATS_PERCENTILES_TABLE} team_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON team_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.team = ${PROBABLE_PITCHERS_TABLE_ALIAS}.team
                AND team_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND team_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND team_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            RIGHT JOIN ${TEAM_ROLLING_STATS_PERCENTILES_TABLE} opponent_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON opponent_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.team = ${PROBABLE_PITCHERS_TABLE_ALIAS}.opponent
                AND opponent_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND opponent_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
                AND opponent_${TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.season_year = ?
            WHERE
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND ${PROBABLE_PITCHERS_TABLE_ALIAS}.nrfi_likelihood_score IS NOT NULL
            ORDER BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date ASC, avg_nrfi_score DESC
            `,
            [spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, spanDays, seasonYear, startDate, endDate]
        );
        console.log(`Query returned ${nrfiRankings ? nrfiRankings.length : 0} rows`);
        return nrfiRankings as NRFIRanking[];
    }

    async getPlayerGameLogs(
        playerIds: number[],
        lastN: number = 10,
        seasonYear: number = new Date().getFullYear(),
    ): Promise<GameLogRow[]> {
        if (!playerIds.length) throw new Error('player_ids required');
        const idPlaceholders = playerIds.map(() => '?').join(', ');
        const [rows] = await this.db.query<GameLogRow[]>(`
            SELECT * FROM (
                SELECT
                    p.id AS players_id,
                    pgl.player_id,
                    DATE_FORMAT(pgl.game_date, '%Y-%m-%d') AS game_date,
                    pgl.opponent, pgl.is_home, pgl.position,
                    pgl.ab, pgl.h, pgl.r, pgl.rbi, pgl.hr, pgl.sb, pgl.bb, pgl.k,
                    pgl.singles, pgl.doubles, pgl.triples, pgl.total_bases,
                    pgl.ip, pgl.er, pgl.hits_allowed, pgl.walks_allowed, pgl.strikeouts,
                    pgl.qs, pgl.sv, pgl.hld, pgl.nrfi,
                    pgl.home_runs_allowed, pgl.batters_faced, pgl.fantasy_points,
                    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pgl.game_date DESC, pgl.id DESC) AS rn
                FROM ${PLAYER_GAME_LOGS_TABLE} pgl
                INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = pgl.player_id
                WHERE p.id IN (${idPlaceholders}) AND pgl.season_year = ?
            ) t
            WHERE t.rn <= ?
            ORDER BY t.players_id, t.game_date DESC
        `, [...playerIds, seasonYear, lastN]);
        return rows;
    }

    async getPlayerSavantProfile(
        playerId: number,
        seasonYear: number = new Date().getFullYear(),
    ): Promise<SavantProfileRow[]> {
        const [rows] = await this.db.query<SavantProfileRow[]>(`
            SELECT
                pss.player_id, pss.season_year, pss.position, pss.team, pss.age,
                pss.games, pss.pa, pss.ab, pss.ip, pss.era, pss.whip, pss.qs, pss.sv, pss.hld,
                pss.avg, pss.obp, pss.slg, pss.ops, pss.bb_rate, pss.k_rate,
                pss.iso, pss.babip, pss.woba, pss.wrc_plus, pss.wraa, pss.sprint_speed,
                pss.barrel_pct, pss.hard_hit_pct, pss.avg_ev, pss.max_ev, pss.sweet_spot_pct,
                pss.chase_pct, pss.contact_pct, pss.zone_contact_pct, pss.whiff_pct,
                pss.fip, pss.x_fip, pss.k_per_9, pss.bb_per_9, pss.hr_per_9,
                pss.k_pct, pss.bb_pct, pss.lob_pct, pss.csw_pct, pss.swinging_strike_pct,
                pss.ground_ball_pct, pss.fly_ball_pct,
                pss_pct.hits_pct, pss_pct.hr_pct, pss_pct.rbi_pct, pss_pct.runs_pct, pss_pct.sb_pct,
                pss_pct.avg_pct, pss_pct.obp_pct, pss_pct.slg_pct, pss_pct.ops_pct,
                pss_pct.bb_rate_pct, pss_pct.k_rate_pct, pss_pct.iso_pct, pss_pct.babip_pct,
                pss_pct.woba_pct, pss_pct.wrc_plus_pct, pss_pct.wraa_pct,
                pss_pct.barrel_pct_pct, pss_pct.hard_hit_pct_pct, pss_pct.avg_ev_pct,
                pss_pct.max_ev_pct, pss_pct.sweet_spot_pct_pct, pss_pct.chase_pct_pct,
                pss_pct.contact_pct_pct, pss_pct.zone_contact_pct_pct, pss_pct.whiff_pct_pct,
                pss_pct.era_pct, pss_pct.whip_pct, pss_pct.fip_pct, pss_pct.x_fip_pct,
                pss_pct.k_per_9_pct, pss_pct.bb_per_9_pct, pss_pct.hr_per_9_pct,
                pss_pct.k_pct_pct, pss_pct.bb_pct_pct, pss_pct.lob_pct_pct, pss_pct.csw_pct_pct,
                pss_pct.swinging_strike_pct_pct, pss_pct.ground_ball_pct_pct, pss_pct.fly_ball_pct_pct,
                pss_pct.qs_pct, pss_pct.sv_pct, pss_pct.hld_pct, pss_pct.sprint_speed_pct,
                pss_pct.reliability_score
            FROM ${PLAYER_SEASON_STATS_TABLE} pss
            INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = pss.player_id
            LEFT JOIN ${PLAYER_SEASON_STATS_PERCENTILES_TABLE} pss_pct
                ON pss_pct.player_id = pss.player_id
                AND pss_pct.position = pss.position
                AND pss_pct.season_year = pss.season_year
            WHERE p.id = ? AND pss.season_year = ?
            ORDER BY CASE WHEN pss.position != 'P' THEN 0 ELSE 1 END
        `, [playerId, seasonYear]);
        return rows;
    }

    async getPlayerAdvancedRolling(
        playerId: number,
        spanDays: SpanDays = 14,
        seasonYear: number = new Date().getFullYear(),
        position?: string,
    ): Promise<AdvancedRollingRow[]> {
        const params: (string | number)[] = [playerId, spanDays, seasonYear];
        let positionClause = '';
        if (position) {
            positionClause = 'AND pars.position = ?';
            params.push(position.toUpperCase());
        }
        const [rows] = await this.db.query<AdvancedRollingRow[]>(`
            SELECT
                pars.span_days, pars.split_type, pars.position,
                DATE_FORMAT(pars.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(pars.end_date, '%Y-%m-%d') AS end_date,
                pars.games, pars.abs, pars.ip,
                pars.obp, pars.slg, pars.ops, pars.bb_rate, pars.k_rate,
                pars.babip, pars.iso, pars.contact_pct, pars.gb_fb_ratio,
                pars.lob_batting_pct, pars.woba, pars.woba_plus, pars.obp_plus,
                pars.slg_plus, pars.ops_plus, pars.wraa,
                pars.fip, pars.k_per_9, pars.bb_per_9, pars.hr_per_9,
                pars.k_bb_ratio, pars.lob_pitching_pct, pars.fip_minus, pars.era_minus,
                pars_pct.obp_pct, pars_pct.slg_pct, pars_pct.ops_pct,
                pars_pct.bb_rate_pct, pars_pct.k_rate_pct, pars_pct.babip_pct,
                pars_pct.iso_pct, pars_pct.contact_pct_pct, pars_pct.gb_fb_ratio_pct,
                pars_pct.lob_batting_pct_pct, pars_pct.woba_pct, pars_pct.woba_plus_pct,
                pars_pct.obp_plus_pct, pars_pct.slg_plus_pct, pars_pct.ops_plus_pct,
                pars_pct.wraa_pct, pars_pct.fip_pct, pars_pct.k_per_9_pct,
                pars_pct.bb_per_9_pct, pars_pct.hr_per_9_pct, pars_pct.k_bb_ratio_pct,
                pars_pct.lob_pitching_pct_pct, pars_pct.fip_minus_pct, pars_pct.era_minus_pct,
                pars_pct.reliability_score, pars_pct.is_reliable
            FROM ${ADVANCED_ROLLING_STATS_TABLE} pars
            INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = pars.player_id
            LEFT JOIN ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} pars_pct
                ON pars_pct.player_id = pars.player_id
                AND pars_pct.position = pars.position
                AND pars_pct.span_days = pars.span_days
                AND pars_pct.split_type = pars.split_type
                AND pars_pct.season_year = pars.season_year
            WHERE p.id = ?
                AND pars.span_days = ?
                AND pars.split_type = 'overall'
                AND pars.season_year = ?
                ${positionClause}
            ORDER BY CASE WHEN pars.position != 'P' THEN 0 ELSE 1 END
        `, params);
        return rows;
    }

    async getPlayerMatchupContext(
        playerId: number,
        gameDate: string,
        seasonYear: number = new Date().getFullYear(),
    ): Promise<MatchupContext | null> {
        type PlayerRow = { id: number; player_id: number; name: string; mlb_team: string; position: string };
        const [[player]] = await this.db.query<PlayerRow[]>(
            `SELECT id, player_id, name, mlb_team, position FROM ${PLAYERS_TABLE} WHERE id = ? LIMIT 1`,
            [playerId]
        );
        if (!player) return null;

        const isPitcher = player.position === 'P';
        type LookupRow = { bats: string | null; throws: string | null };
        const [[lookup]] = await this.db.query<LookupRow[]>(
            `SELECT bats, throws FROM ${PLAYER_LOOKUPS_TABLE} WHERE player_id = ? AND position = ? LIMIT 1`,
            [player.player_id, isPitcher ? 'P' : 'B']
        );

        type GameRow = { team: string; opponent: string; home: number; game_id: string };
        const [[myGame]] = await this.db.query<GameRow[]>(
            `SELECT team, opponent, home, game_id FROM ${PROBABLE_PITCHERS_TABLE}
             WHERE team = ? AND game_date = ? LIMIT 1`,
            [player.mlb_team, gameDate]
        );
        if (!myGame) return null;

        const homeOrAway = myGame.home ? 'home' : 'away';

        type SplitRow = { ops: number | null; so_rate: number | null; bb_rate: number | null };
        type SplitPctRow = { ops_pct: number | null; so_rate_pct: number | null; bb_rate_pct: number | null };
        const spanDays = 30;

        if (!isPitcher) {
            type OppPitcherRow = { player_id: number; pitcher_name: string };
            const [[oppPitcher]] = await this.db.query<OppPitcherRow[]>(
                `SELECT player_id, pitcher_name FROM ${PROBABLE_PITCHERS_TABLE}
                 WHERE team = ? AND game_date = ? LIMIT 1`,
                [myGame.opponent, gameDate]
            );

            let opposingStarter: MatchupContext['opposing_starter'] = null;
            let opposingTeamSplit: MatchupContext['opposing_team_split'] = null;

            if (oppPitcher?.player_id) {
                type OppStatsRow = { throws: string | null; era: number | null; whip: number | null; k_per_9: number | null; name: string | null };
                const [[oppStats]] = await this.db.query<OppStatsRow[]>(`
                    SELECT pl.throws, pss.era, pss.whip, pss.k_per_9, p2.name
                    FROM ${PLAYER_LOOKUPS_TABLE} pl
                    LEFT JOIN ${PLAYER_SEASON_STATS_TABLE} pss
                        ON pss.player_id = pl.player_id AND pss.position = 'P' AND pss.season_year = ?
                    LEFT JOIN ${PLAYERS_TABLE} p2
                        ON p2.player_id = pl.player_id AND p2.position = 'P'
                    WHERE pl.player_id = ? AND pl.position = 'P'
                    LIMIT 1
                `, [seasonYear, oppPitcher.player_id]);

                if (oppStats) {
                    opposingStarter = {
                        name: oppStats.name || oppPitcher.pitcher_name,
                        season_era: oppStats.era,
                        season_whip: oppStats.whip,
                        k_per_9: oppStats.k_per_9,
                        throws: oppStats.throws,
                    };

                    if (oppStats.throws) {
                        const [[split]] = await this.db.query<SplitRow[]>(
                            `SELECT ops, so_rate, bb_rate FROM ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE.replace('_percentiles', '')}
                             WHERE team = ? AND throws = ? AND span_days = ? AND season_year = ?`,
                            [player.mlb_team, oppStats.throws, spanDays, seasonYear]
                        );
                        const [[splitPct]] = await this.db.query<SplitPctRow[]>(
                            `SELECT ops_pct, so_rate_pct, bb_rate_pct FROM ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE}
                             WHERE team = ? AND throws = ? AND span_days = ? AND season_year = ?`,
                            [player.mlb_team, oppStats.throws, spanDays, seasonYear]
                        );
                        if (split) {
                            opposingTeamSplit = {
                                ops: split.ops, k_rate: split.so_rate, bb_rate: split.bb_rate,
                                ops_pct: splitPct?.ops_pct ?? null,
                                so_rate_pct: splitPct?.so_rate_pct ?? null,
                                bb_rate_pct: splitPct?.bb_rate_pct ?? null,
                            };
                        }
                    }
                }
            }
            return { game_date: gameDate, home_or_away: homeOrAway, opposing_starter: opposingStarter, opposing_team_split: opposingTeamSplit };
        } else {
            const throws = lookup?.throws ?? null;
            let opposingTeamSplit: MatchupContext['opposing_team_split'] = null;
            if (throws) {
                const [[split]] = await this.db.query<SplitRow[]>(
                    `SELECT ops, so_rate, bb_rate FROM ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE.replace('_percentiles', '')}
                     WHERE team = ? AND throws = ? AND span_days = ? AND season_year = ?`,
                    [myGame.opponent, throws, spanDays, seasonYear]
                );
                const [[splitPct]] = await this.db.query<SplitPctRow[]>(
                    `SELECT ops_pct, so_rate_pct, bb_rate_pct FROM ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE}
                     WHERE team = ? AND throws = ? AND span_days = ? AND season_year = ?`,
                    [myGame.opponent, throws, spanDays, seasonYear]
                );
                if (split) {
                    opposingTeamSplit = {
                        ops: split.ops, k_rate: split.so_rate, bb_rate: split.bb_rate,
                        ops_pct: splitPct?.ops_pct ?? null,
                        so_rate_pct: splitPct?.so_rate_pct ?? null,
                        bb_rate_pct: splitPct?.bb_rate_pct ?? null,
                    };
                }
            }
            return { game_date: gameDate, home_or_away: homeOrAway, opposing_starter: null, opposing_team_split: opposingTeamSplit };
        }
    }

    async getPlayerRecentSplits(
        playerId: number,
        seasonYear: number = new Date().getFullYear(),
    ): Promise<RecentSplits> {
        type RollingRow = { span_days: number; position: string; games: number; rbi: number; runs: number; hr: number; sb: number; hits: number; abs: number; avg: number; k: number; strikeouts: number; ip: number; er: number; qs: number; sv: number; hld: number; nrfi: number; whip: number; era: number };
        const [rollingRows] = await this.db.query<RollingRow[]>(`
            SELECT prs.span_days, prs.position, prs.games, prs.rbi, prs.runs, prs.hr,
                prs.sb, prs.hits, prs.abs, prs.avg, prs.k, prs.strikeouts,
                prs.ip, prs.er, prs.qs, prs.sv, prs.hld, prs.nrfi, prs.whip, prs.era
            FROM ${BASIC_ROLLING_STATS_TABLE} prs
            INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = prs.player_id
            WHERE p.id = ? AND prs.split_type = 'overall' AND prs.season_year = ?
                AND prs.span_days IN (7, 14, 30)
            ORDER BY CASE WHEN prs.position != 'P' THEN 0 ELSE 1 END, prs.span_days
        `, [playerId, seasonYear]);

        type PriorRow = { total_fp: number | null; avg_fp: number | null; games: number };
        const [[priorRow]] = await this.db.query<PriorRow[]>(`
            SELECT
                SUM(pgl.fantasy_points) AS total_fp,
                AVG(pgl.fantasy_points) AS avg_fp,
                COUNT(*) AS games
            FROM ${PLAYER_GAME_LOGS_TABLE} pgl
            INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = pgl.player_id
            WHERE p.id = ? AND pgl.season_year = ?
                AND pgl.game_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                                      AND DATE_SUB(CURDATE(), INTERVAL 8 DAY)
        `, [playerId, seasonYear]);

        type Last7Row = { total_fp: number | null; avg_fp: number | null };
        const [[last7Row]] = await this.db.query<Last7Row[]>(`
            SELECT SUM(pgl.fantasy_points) AS total_fp, AVG(pgl.fantasy_points) AS avg_fp
            FROM ${PLAYER_GAME_LOGS_TABLE} pgl
            INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = pgl.player_id
            WHERE p.id = ? AND pgl.season_year = ?
                AND pgl.game_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `, [playerId, seasonYear]);

        const toMap = (row: RollingRow) => ({
            span_days: row.span_days, position: row.position, games: row.games,
            rbi: row.rbi, runs: row.runs, hr: row.hr, sb: row.sb,
            hits: row.hits, abs: row.abs, avg: row.avg, k: row.k,
            strikeouts: row.strikeouts, ip: row.ip, er: row.er,
            qs: row.qs, sv: row.sv, hld: row.hld, nrfi: row.nrfi,
            whip: row.whip, era: row.era,
        });

        const last7Stats = rollingRows.find(r => r.span_days === 7) ?? null;
        const last14Stats = rollingRows.find(r => r.span_days === 14) ?? null;
        const last30Stats = rollingRows.find(r => r.span_days === 30) ?? null;

        const last7Fp = last7Row?.total_fp ?? 0;
        const prior7Fp = priorRow?.total_fp ?? 0;
        const delta = last7Fp - prior7Fp;
        const trend: RecentSplits['trend'] = delta > 10 ? 'heating_up' : delta < -10 ? 'cooling' : 'steady';

        return {
            last_7: last7Stats ? toMap(last7Stats) : null,
            prior_7: priorRow ? { total_fantasy_points: priorRow.total_fp, avg_fantasy_points: priorRow.avg_fp, games: priorRow.games } : null,
            last_14: last14Stats ? toMap(last14Stats) : null,
            last_30: last30Stats ? toMap(last30Stats) : null,
            trend,
        };
    }

    async getPlayersByIds(
        playerIds: number[],
        spanDays: SpanDays = 14,
        seasonYear: number = new Date().getFullYear(),
    ): Promise<PlayerFantasyRanking[]> {
        if (!playerIds.length) throw new Error('player_ids required');
        const [batters, pitchers] = await Promise.all([
            this.getPlayerFantasyRankings(1, spanDays, 'B', true, false, false, false, seasonYear, playerIds),
            this.getPlayerFantasyRankings(1, spanDays, 'P', true, false, false, false, seasonYear, playerIds),
        ]);
        return [...batters, ...pitchers];
    }

    async getPlayerStreakStatus(
        playerId: number,
        seasonYear: number = new Date().getFullYear(),
    ): Promise<StreakStatus> {
        type LogRow = { game_date: string; position: string | null; h: number | null; bb: number | null; hit_by_pitch: number | null; hr: number | null; sb: number | null; er: number | null; ip: number | null; qs: number | null };
        const [rows] = await this.db.query<LogRow[]>(`
            SELECT
                DATE_FORMAT(pgl.game_date, '%Y-%m-%d') AS game_date,
                pgl.position, pgl.h, pgl.bb, pgl.hit_by_pitch,
                pgl.hr, pgl.sb, pgl.er, pgl.ip, pgl.qs
            FROM ${PLAYER_GAME_LOGS_TABLE} pgl
            INNER JOIN ${PLAYERS_TABLE} p ON p.player_id = pgl.player_id
            WHERE p.id = ? AND pgl.season_year = ?
            ORDER BY pgl.game_date DESC, pgl.id DESC
        `, [playerId, seasonYear]);

        let hitStreak = 0, hitBroken = false;
        let obStreak = 0, obBroken = false;
        let multiHit = 0, multiHitBroken = false;
        let scoreless = 0, scorelessBroken = false;
        let qs = 0, qsBroken = false;
        let sinceHR = 0, hrFound = false;
        let sinceSB = 0, sbFound = false;
        const lastActiveGameDate = rows[0]?.game_date ?? null;

        for (const row of rows) {
            const h = row.h ?? 0;
            const bb = row.bb ?? 0;
            const hbp = row.hit_by_pitch ?? 0;
            const hr = row.hr ?? 0;
            const sb = row.sb ?? 0;
            const er = row.er ?? 0;
            const qsVal = row.qs ?? 0;
            const isPitcherGame = row.position === 'SP' || row.position === 'RP' || row.position === 'P';

            if (!hitBroken) { if (h > 0) hitStreak++; else hitBroken = true; }
            if (!obBroken) { if (h > 0 || bb > 0 || hbp > 0) obStreak++; else obBroken = true; }
            if (!multiHitBroken) { if (h >= 2) multiHit++; else multiHitBroken = true; }
            if (isPitcherGame && !scorelessBroken) { if (er === 0) scoreless++; else scorelessBroken = true; }
            if (isPitcherGame && !qsBroken) { if (qsVal === 1) qs++; else qsBroken = true; }
            if (!hrFound) { if (hr > 0) hrFound = true; else sinceHR++; }
            if (!sbFound) { if (sb > 0) sbFound = true; else sinceSB++; }
        }

        return {
            hit_streak_games: hitStreak,
            on_base_streak_games: obStreak,
            multi_hit_streak: multiHit,
            scoreless_innings_streak: scoreless,
            consecutive_quality_starts: qs,
            games_since_last_hr: sinceHR,
            games_since_last_sb: sinceSB,
            last_active_game_date: lastActiveGameDate,
        };
    }
}

export default Player;