import { executeInTransaction, QueryableDB } from '../db';
import type { Team } from './team';

type DefaultPlayerFields = 'id' | 'name' | 'mlb_team' | 'eligible_positions' | 'selected_position' | 'headshot_url';
type PitcherBasicScoringFields = 'strikeouts' | 'era' | 'whip' | 'qs' | 'sv' | 'hld' | 'ip';
type PitcherAdvancedScoringFields = 'k_per_9' | 'bb_per_9' | 'fip';
type HitterBasicScoringFields = 'runs' | 'hr' | 'rbi' | 'sb' | 'avg' | 'hits' | 'abs';
type HitterAdvancedScoringFields = 'obp' | 'slg' | 'ops' | 'k_rate' | 'bb_rate' | 'iso' | 'wraa';
type PlayerScoringFields = PitcherBasicScoringFields | HitterBasicScoringFields;
type PlayerAdvancedScoringFields = PitcherAdvancedScoringFields | HitterAdvancedScoringFields;

interface PlayerSelectScoringFields {
    basic: PlayerScoringFields[];
    advanced: PlayerAdvancedScoringFields[];
    raw: PlayerScoringFields[];
}

/** Table aliases as const so the same identifiers can be used in type definitions (e.g. TwoStartPitcher) and at runtime. */
const PLAYERS_TABLE_ALIAS = 'p' as const;
const BASIC_ROLLING_STATS_TABLE_ALIAS = 'prs_raw' as const;
const BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS = 'prs_pct' as const;
const ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS = 'pars_pct' as const;
const PROBABLE_PITCHERS_TABLE_ALIAS = 'pp' as const;
const TEAMS_TABLE_ALIAS = 't' as const;
const PLAYER_LOOKUPS_TABLE_ALIAS = 'pl' as const;
const TEAM_ROLLING_STATS_PERCENTILES_TABLE_ALIAS = 'trs_pct' as const;
const TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE_ALIAS = 'tvp_pct' as const;
const TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE_ALIAS = 'tvb_pct' as const;

/** Table names (not specific to Player; shared where queries reference these tables). */
const PROBABLE_PITCHERS_TABLE = 'probable_pitchers';
const PLAYERS_TABLE = 'players';
const TEAMS_TABLE = 'teams';
const PLAYER_LOOKUPS_TABLE = 'player_lookup';
const BASIC_ROLLING_STATS_TABLE = 'player_rolling_stats';
const BASIC_ROLLING_STATS_PERCENTILES_TABLE = 'player_rolling_stats_percentiles';
const PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE = 'player_advanced_rolling_stats_percentiles';
const TEAM_ROLLING_STATS_PERCENTILES_TABLE = 'team_rolling_stats_percentiles';
const TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE = 'team_vs_pitcher_splits_percentiles';
const TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE = 'team_vs_batter_splits_percentiles';

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
type TwoStartPitcher = TwoStartPitcherBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>>;

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
type ProbablePitcher = ProbablePitcherBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>>
    & Partial<Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>>
    & Partial<Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>>;

type WatchlistBase = {
    span_days: number;
    split_type: string;
};
type Watchlist = WatchlistBase
    & Record<`${typeof PLAYERS_TABLE_ALIAS}.${DefaultPlayerFields}`, string>;

type HitterWatchlist = Watchlist 
    & Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${HitterBasicScoringFields}`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterBasicScoringFields}_pct`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${HitterAdvancedScoringFields}_pct`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>;

type PitcherWatchlist = Watchlist 
    & Record<`${typeof BASIC_ROLLING_STATS_TABLE_ALIAS}.${PitcherBasicScoringFields}`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherBasicScoringFields}_pct`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${PitcherAdvancedScoringFields}_pct`, number>
    & Record<`${typeof BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>
    & Record<`${typeof ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`, number>;

type HitterScoringWatchlist = HitterWatchlist
    & {
        fantasy_score: number;
    };
type HitterSpeedWatchlist = HitterWatchlist
    & {
        sb_pickup_score: number;
    };
type HitterContactOnBaseWatchlist = HitterWatchlist
    & {
        contact_onbase_score: number;
    };
type HitterPowerWatchlist = HitterWatchlist
    & {
        power_score: number;
    };
type PitcherScoringWatchlist = PitcherWatchlist
    & {
        fantasy_score: number;
    };
type PitcherStarterWatchlist = PitcherWatchlist
    & {
        k_qs_score: number;
    };
type PitcherRelieverWatchlist = PitcherWatchlist
    & {
        leverage_relief_score: number;
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

    async searchPlayers(query: {
        positionType: string;
        position: string;
        isRostered: string;
        spanDays: number;
        page: number;
        orderBy: string;
        isUserTeam: string;
    }): Promise<any> {
        let {
            positionType,
            position,
            isRostered,
            spanDays,
            page,
            orderBy,
            isUserTeam,
        } = query;

        position = position !== 'false' ? position : '';
        isRostered = isRostered !== 'false' ? isRostered : '';
        isUserTeam = isUserTeam !== 'false' ? isUserTeam : '';
        orderBy = orderBy !== 'false' ? orderBy : '';

        const teamId = isUserTeam ? await this.getUserTeamId() : false;

        if ( positionType === 'B' || positionType === 'P' ) {
            return await this.getPlayerFantasyRankings(page, spanDays, positionType as 'B' | 'P', isRostered as boolean, position, orderBy, teamId);
        } else if ( positionType === 'speed' ) {
            return await this.getHitterSpeedWatchlist(page, spanDays, position, teamId);
        } else if ( positionType === 'contact' ) {
            return await this.getHitterContactOnBaseWatchlist(page, spanDays, position, teamId);
        } else if ( positionType === 'power' ) {
            return await this.getHitterPowerWatchlist(page, spanDays, position, teamId);
        } else if ( positionType === 'starter' ) {
            return await this.getPitcherStarterWatchlist(page, spanDays, teamId);
        } else if ( positionType === 'reliever' ) {
            return await this.getPitcherRelieverWatchlist(page, spanDays, teamId);
        } else {
            throw new Error('Invalid position type');
        }
    }

    async getAvailablePitchers(query, type='daily-streamer') {
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        if ( type === 'daily-streamer' ) {
            return await this.getAvailableDailyStreamingPitchers(startDate, endDate);
        } else if ( type === 'two-start' ) {
            return await this.getAvailableTwoStartPitchers(startDate, endDate);
        } else if ( type === 'nrfi' ) {
            return await this.getNRFIRankings(startDate, endDate);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getProbablesStatsForTeam(teamId, query) {
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        const twoStartPitchers = await this.getTwoStartPitchersForTeam(teamId, startDate, endDate);
        const probablePitchers = await this.getProbablePitchersForTeam(teamId, startDate, endDate);
                
        return {
            twoStartPitchers,
            probablePitchers,
        };
    }

    async getStatsForTeam(teamId, query, type='batting') {
        const {
            spanDays,
            orderBy,
        } = query;
        if ( type === 'batting' ) {
            return await this.getScoringStatsForTeamBatters(teamId, spanDays, orderBy);
        } else if ( type === 'pitching' ) {
            return await this.getScoringStatsForTeamPitchers(teamId, spanDays, orderBy);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getScheduleStrengthForTeam(teamId, query, type='batting') {
        const {
            startDate,
            endDate,
            spanDays,
        } = this.getDateRange(query);
        if ( type === 'batting' ) {
            return await this.getWeeklyHitterScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays);
        } else if ( type === 'pitching' ) {
            return await this.getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays);
        } else {
            throw new Error('Invalid type');
        }
    }

    getDateRange(query) {
        let {
            startDate,
            endDate,
        } = query;
        
        console.log(`getDateRange - input query:`, query);
        
        if ( ! startDate ) {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - startDate.getDay());
            // Format default date
            startDate = startDate.toISOString().split('T')[0];
        }
        if ( ! endDate ) {
            endDate = new Date();
            endDate.setDate(endDate.getDate() - endDate.getDay() + 6);
            // Format default date
            endDate = endDate.toISOString().split('T')[0];
        }
        
        console.log(`getDateRange - output: startDate: ${startDate}, endDate: ${endDate}`);
        
        // If dates are already strings in YYYY-MM-DD format, use them as-is
        // The database stores dates in this format, so no conversion needed
        return {
            startDate: startDate,
            endDate: endDate,
        };
    }

    getDefaultPlayerFields(): PlayerSelectScoringFields { 
        return {
            basic: [],
            advanced: [],
            raw: [],
        };
    }

    mergeScoringFields(...selectScoringFields: PlayerSelectScoringFields[]): PlayerSelectScoringFields {
        const basic = selectScoringFields.flatMap(field => field.basic);
        const advanced = selectScoringFields.flatMap(field => field.advanced);
        const raw = selectScoringFields.flatMap(field => field.raw);
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
            scoringFields.push(`${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`);
        }
        if (selectScoringFields.advanced.length > 0) {
            scoringFields.push(...selectScoringFields.advanced.map(field => `${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.${field}_pct`));
            scoringFields.push(`${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score`);
        }
        if (selectScoringFields.raw.length > 0) {
            scoringFields.push(...selectScoringFields.raw.map(field => `${BASIC_ROLLING_STATS_TABLE_ALIAS}.${field}`));
        }
        return scoringFields;
    }

    getPitcherScoringFields(): PlayerSelectScoringFields {
        const pitcherScoringFields = [
            'strikeouts', 'era', 'whip', 'qs', 'sv', 'hld'
        ] as PitcherBasicScoringFields[];
        const rawFields = [ 'ip' ] as PitcherBasicScoringFields[];
        return {
            basic: pitcherScoringFields,
            advanced: [],
            raw: rawFields,
        };
    }

    getPitcherAdvancedScoringFields(): PlayerSelectScoringFields {
        const pitcherAdvancedScoringFields = [
            'k_per_9', 'bb_per_9', 'fip'
        ] as PitcherAdvancedScoringFields[];
        return {
            basic: [],
            advanced: pitcherAdvancedScoringFields,
            raw: [],
        };
    }
    
    getHitterScoringFields(): PlayerSelectScoringFields {
        const hitterScoringFields = [
            'runs', 'hr', 'rbi', 'sb', 'avg'
        ] as HitterBasicScoringFields[];
        const rawFields = [ 'hits', 'abs' ] as HitterBasicScoringFields[];
        return {
            basic: hitterScoringFields,
            advanced: [],
            raw: rawFields,
        };
    }

    getHitterAdvancedScoringFields(): PlayerSelectScoringFields {
        const hitterAdvancedScoringFields = [
            'obp', 'slg', 'ops', 'k_rate', 'bb_rate', 'iso', 'wraa'
        ] as HitterAdvancedScoringFields[];
        return {
            basic: [],
            advanced: hitterAdvancedScoringFields,
            raw: [],
        };
    }

    async getUserTeamId(): Promise<number | false> {
        try {
            const [[team]] = await this.db.query<Team[]>(
                `SELECT id FROM ${TEAMS_TABLE} WHERE is_user_team = ? LIMIT 1`,
                [true]
            );
            if (!team) {
                return false;
            }
            const teamId = team.id;
            return teamId;            
        } catch (error) {
            console.error('Error getting user team id:', error);
            return false;
        }
    }

    async getAvailableTwoStartPitchers(startDate: string, endDate: string): Promise<TwoStartPitcher[]> {
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
                AVG(${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score) OVER (PARTITION BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id) AS avg_qs_score
                ${this.getFields(pitcherScoringFields).join(', ')},
            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS} 
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall' 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS} 
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall' 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS} 
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall' 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
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
            [spanDays, spanDays, spanDays, startDate, endDate, startDate, endDate]
        );
        return probablePitchers;
    }

    async getAvailableDailyStreamingPitchers(startDate: string, endDate: string): Promise<ProbablePitcher[]> {
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
                ${this.getFields(pitcherScoringFields).join(', ')},
            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS} 
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall' 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            WHERE 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND ${PLAYERS_TABLE_ALIAS}.status = 'free_agent'
            ORDER BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date, ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score DESC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name
            `,
            [spanDays, spanDays, spanDays, startDate, endDate]
        );
        return probablePitchers;
    }

    async getTwoStartPitchersForTeam(teamId: number, startDate: string, endDate: string): Promise<TwoStartPitcher[]> {
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
                AVG(${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score) OVER (PARTITION BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id) AS avg_qs_score
                ${this.getFields(defaultPlayerFields).join(', ')},
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

    async getProbablePitchersForTeam(teamId: number, startDate: string, endDate: string): Promise<ProbablePitcher[]> {
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
                ${this.getFields(defaultPlayerFields).join(', ')},
            FROM ${PROBABLE_PITCHERS_TABLE} ${PROBABLE_PITCHERS_TABLE_ALIAS}
            JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${PROBABLE_PITCHERS_TABLE_ALIAS}.player_id
            WHERE 
                ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date BETWEEN ? AND ?
                AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
                AND ${PLAYERS_TABLE_ALIAS}.team_id = ?
            ORDER BY ${PROBABLE_PITCHERS_TABLE_ALIAS}.game_date ASC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.qs_likelihood_score DESC, ${PROBABLE_PITCHERS_TABLE_ALIAS}.normalised_name ASC
            `,
            [startDate, endDate, teamId]
        );
        return probablePitchers;
    }

    async getScoringStatsForTeamBatters(teamId: number, spanDays: number = 14, orderBy: string | false = false): Promise<HitterScoringWatchlist[]> {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        const scoringFields = this.mergeScoringFields(
            this.getHitterScoringFields(), 
            this.getHitterAdvancedScoringFields()
        );
        let orderByClause = '';
        if (orderBy) {
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
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
            LEFT JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall' AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            WHERE 
                ${PLAYERS_TABLE_ALIAS}.team_id = ? 
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            ${orderByClause}
            `,
            [spanDays, spanDays, spanDays, teamId]
        );
        return playerStats;
    }

    async getScoringStatsForTeamPitchers(teamId: number, spanDays: number = 14, orderBy: string | false = false): Promise<PitcherScoringWatchlist[]> {
        if (!teamId) {
            throw new Error('Missing required parameters');
        }
        const scoringFields = this.mergeScoringFields(
            this.getPitcherScoringFields(), 
            this.getPitcherAdvancedScoringFields()
        );
        let orderByClause = '';
        if (orderBy) {
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
                + ${svh_weight} * GREATEST(${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.sv_pct, ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.hld_pct) + 
                + ${era_weight} * (100 - ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.era_pct)
                + ${whip_weight} * (100 - ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.whip_pct)) AS fantasy_score

            FROM ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS}
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = 'overall'
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = ${PLAYERS_TABLE_ALIAS}.position
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall'
            LEFT JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${PLAYERS_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = 'overall' AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            WHERE 
                ${PLAYERS_TABLE_ALIAS}.team_id = ? AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
            ${orderByClause}
            `,
            [spanDays, spanDays, spanDays, teamId]
        );
        return playerStats;
    }

    async getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays=14) {
        if (!teamId || !startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        return executeInTransaction(async (connection) => {
            const outerPlayerFields = this.defaultPlayerFields.map(field => `${field}`).join(', ');
            const innerPlayerFields = this.getPlayerFields();
            const [pitcherScores] = await connection.query(`
                SELECT 
                    ${outerPlayerFields}, 
                    AVG(start_score) AS pitcher_week_score, COUNT(*) AS starts, 
                    MAX(qs_pct) AS qs_pct, MAX(sv_pct) AS sv_pct, MAX(hld_pct) AS hld_pct, 
                    100 - AVG(opp_ops_vs_hand_pct) AS opp_ops_vs_hand_pct,
                    MAX(fip_pct) AS fip_pct, MAX(bb_per_9_pct) AS bb_per_9_pct, MAX(k_per_9_pct) AS k_per_9_pct, 
                    MAX(reliability_score) AS reliability_score
                    FROM (
                        SELECT
                            ${innerPlayerFields}, 
                            pp.player_id,
                            pp.game_date,
                            pp.team,
                            pp.opponent,
                            pp.home,
                            tvp.ops_pct     AS opp_ops_vs_hand_pct,
                            pars.fip_pct,
                            prs_pct.qs_pct,
                            prs_pct.sv_pct,
                            prs_pct.hld_pct,
                            pars.bb_per_9_pct,
                            pars.k_per_9_pct,
                            pars.reliability_score,
                            /* start_score formula - handle NULLs gracefully */
                            (0.45*(100 - COALESCE(tvp.ops_pct, 50))  -- Default to 50 if missing
                                + 0.25*COALESCE(pars.fip_pct, 50)    -- Default to 50 if missing
                                + 0.20*COALESCE(prs_pct.qs_pct, 50)      -- Default to 50 if missing
                                + 0.10*(100 - COALESCE(pars.bb_per_9_pct, 50))  -- Default to 50 if missing
                                + CASE WHEN pp.home THEN 3 ELSE 0 END) AS start_score
                        FROM ${PROBABLE_PITCHERS_TABLE} pp
                        JOIN ${PLAYERS_TABLE} p ON p.player_id = pp.player_id AND p.position = 'P'
                        JOIN ${PLAYER_LOOKUPS_TABLE} lu ON lu.player_id = pp.player_id
                        LEFT JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} pars
                            ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = ? AND pars.position = 'P'
                        LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} prs_pct
                            ON prs_pct.player_id = pp.player_id AND prs_pct.span_days = ? AND prs_pct.split_type = ? AND prs_pct.position = 'P'
                        LEFT JOIN ${TEAM_VS_PITCHER_SPLITS_PERCENTILES_TABLE} tvp
                            ON tvp.team = pp.opponent AND tvp.throws = lu.throws AND tvp.span_days = ?
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND pp.player_id IS NOT NULL
                            AND p.team_id = ?
                        ) s
                    GROUP BY player_id
                    ORDER BY pitcher_week_score DESC
                `, [spanDays, 'overall', spanDays, 'overall', spanDays, startDate, endDate, teamId]);
            return pitcherScores;
        });
    }

    async getWeeklyHitterScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays=14) {
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
                            pp.game_date,
                            pp.game_id,
                            pl.player_id,
                            pp.team     AS our_team,
                            pp.opponent AS opp_team,
                            CASE WHEN pp.home = 1 THEN 1 ELSE 0 END AS our_home
                        FROM ${PROBABLE_PITCHERS_TABLE} pp
                        JOIN ${PLAYER_LOOKUPS_TABLE} pl
                            ON pl.team = pp.team
                        JOIN ${PLAYERS_TABLE} p ON p.player_id = pl.player_id AND p.position = 'B'
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND p.team_id = ?

                        UNION ALL

                        /* Case B: only opponent has a probable; mirror it */
                        SELECT
                            pp.game_date,
                            pp.game_id,
                            pl.player_id,
                            pp.opponent AS our_team,
                            pp.team     AS opp_team,
                            CASE WHEN pp.home = 1 THEN 0 ELSE 1 END AS our_home
                        FROM ${PROBABLE_PITCHERS_TABLE} pp
                        JOIN ${PLAYER_LOOKUPS_TABLE} pl
                            ON pl.team = pp.opponent
                        JOIN ${PLAYERS_TABLE} p ON p.player_id = pl.player_id AND p.position = 'B'
                        WHERE pp.game_date BETWEEN ? AND ?
                            AND p.team_id = ?
                    ) AS g
                ) AS d
                GROUP BY d.player_id, d.opp_team;
            `, [startDate, endDate, teamId, startDate, endDate, teamId]);
            
            // Query the aggregated results from temporary table
            const playerFields = this.getPlayerFields();
            const advancedScoringFields = this.getHitterAdvancedScoringFields();
            const [hitterScores] = await connection.query(`
                SELECT
                    ${playerFields}, 
                    ${advancedScoringFields},
                    p.player_id,
                    SUM(t.games) AS games,
                    pars.reliability_score,
                    SUM(t.games * (
                        0.50*(100 - trs.whip_pct)
                        + 0.30*(100 - trs.fip_pct)
                        + 0.20*(100 - tvb.ops_pct)
                    )) / NULLIF(SUM(t.games),0) AS hitter_week_score
                FROM temp_opponents t
                JOIN ${PLAYER_LOOKUPS_TABLE} lu ON lu.player_id = t.player_id
                JOIN ${PLAYERS_TABLE} p ON p.player_id = lu.player_id AND p.position = 'B'
                JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} pars
                    ON pars.player_id = t.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'B'
                JOIN ${TEAM_ROLLING_STATS_PERCENTILES_TABLE} trs
                    ON trs.team = t.opponent_team AND trs.split_type = 'overall' AND trs.span_days = ?
                JOIN ${TEAM_VS_BATTER_SPLITS_PERCENTILES_TABLE} tvb
                    ON tvb.team = t.opponent_team AND tvb.bats = lu.bats AND tvb.span_days = ?
                GROUP BY t.player_id
                ORDER BY hitter_week_score DESC;
            `, [spanDays, spanDays, spanDays, teamId]);

            // Drop the temporary table
            await connection.query(`
                DROP TABLE temp_opponents;
            `);
            
            return hitterScores;
        });
    }

    async getHitterSpeedWatchlist(page: number = 1, spanDays: number = 14, position: string | false = false, teamId: number | false = false): Promise<HitterSpeedWatchlist[]> {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
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
            JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'B'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            WHERE 
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ?
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY sb_pickup_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minAbs, playerFilterValue, this.pageSize, offset]);
        return hitterScores;
    }

    async getHitterContactOnBaseWatchlist(page: number = 1, spanDays: number = 14, position: string | false = false, teamId: number | false = false): Promise<HitterContactOnBaseWatchlist[]> {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
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
            JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS} 
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'B'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            WHERE 
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY contact_onbase_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minAbs, playerFilterValue, this.pageSize, offset]);
        return hitterScores;
    }

    async getHitterPowerWatchlist(page: number = 1, spanDays: number = 14, position: string | false = false, teamId: number | false = false): Promise<HitterPowerWatchlist[]> {
        let positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
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
            JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS} 
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'B'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${PLAYERS_TABLE_ALIAS}.position = 'B'
            WHERE 
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'B'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.abs >= ?
                ${playerFilter}
                ${positionFilter}
            ORDER BY power_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minAbs, playerFilterValue, this.pageSize, offset]);
        return hitterScores;
    }

    async getPitcherStarterWatchlist(page: number = 1, spanDays: number = 14, teamId: number | false = false): Promise<PitcherStarterWatchlist[]> {
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
            JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS} 
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
            WHERE 
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 60
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.ip >= ?
                ${playerFilter}
            ORDER BY k_qs_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minIp, playerFilterValue, this.pageSize, offset]);
        return starterScores;
    }

    async getPitcherRelieverWatchlist(page: number = 1, spanDays: number = 14, teamId: number | false = false): Promise<PitcherRelieverWatchlist[]> {
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
            JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}
                ON ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type 
                AND ${ADVANCED_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
            JOIN ${BASIC_ROLLING_STATS_TABLE} ${BASIC_ROLLING_STATS_TABLE_ALIAS}
                ON ${BASIC_ROLLING_STATS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.position = 'P'
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} ${PLAYER_LOOKUPS_TABLE_ALIAS} 
                ON ${PLAYER_LOOKUPS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id
            LEFT JOIN ${PLAYERS_TABLE} ${PLAYERS_TABLE_ALIAS} 
                ON ${PLAYERS_TABLE_ALIAS}.player_id = ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.player_id 
                AND ${PLAYERS_TABLE_ALIAS}.position = 'P'
            WHERE 
                ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.span_days = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.split_type = ? 
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.position = 'P'
                AND ${BASIC_ROLLING_STATS_PERCENTILES_TABLE_ALIAS}.reliability_score >= 55
                AND ${BASIC_ROLLING_STATS_TABLE_ALIAS}.ip >= ?
                ${playerFilter}
            ORDER BY leverage_relief_score DESC
            LIMIT ? OFFSET ?;
        `, [spanDays, 'overall', spanDays, 'overall', minIp, playerFilterValue, this.pageSize, offset]);
        return relieverScores;
    }

    async getPlayerFantasyRankings(page=1, spanDays=14, batterOrPitcher='B', isRostered=false, position=false, orderBy=false, teamId=false) {
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const hitterScoringFields = this.getHitterScoringFields();
        const hitterAdvancedScoringFields = this.getHitterAdvancedScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const scoringFields = batterOrPitcher === 'B' ? hitterScoringFields : pitcherScoringFields;
        const advancedScoringFields = batterOrPitcher === 'B' ? hitterAdvancedScoringFields : pitcherAdvancedScoringFields;
        const isRosteredFilter = ! isRostered ? `AND p.status = 'free_agent'` : '';
        const teamFilter = teamId ? `AND p.team_id = ?` : '';
        const positionFilter = position ? `AND p.is_${position.toLowerCase()} = 1` : '';
        const minDataClause = batterOrPitcher === 'B' ? `AND prs_raw.abs >= ?` : `AND prs_raw.ip >= ?`;
        const minDataValue = batterOrPitcher === 'B' ? 15 : 4;
        const offset = (page - 1) * this.pageSize;
        
        let orderByClause = batterOrPitcher === 'B' ? `batter_score DESC` : `pitcher_score DESC`;
        if ( orderBy ) {
            orderByClause = `prs_pct.${orderBy}_pct DESC, ${orderByClause}`;
        }

        // Build parameters array - ensure all placeholders are bound
        let params;
        if (teamId) {
            // 11 placeholders when teamId exists (including the conditional team_id = ?)
            params = [batterOrPitcher, spanDays, 'overall', batterOrPitcher, batterOrPitcher, spanDays, 'overall', batterOrPitcher, minDataValue, teamId, this.pageSize, offset];
        } else {
            // 10 placeholders when teamId doesn't exist (no conditional team_id = ?)
            params = [batterOrPitcher, spanDays, 'overall', batterOrPitcher, batterOrPitcher, spanDays, 'overall', batterOrPitcher, minDataValue, this.pageSize, offset];
        }

        const sqlQuery = `
            SELECT 
                ${playerFields}, 
                ${scoringFields},
                ${advancedScoringFields},
                prs_pct.span_days,
                prs_pct.split_type,

                /* Batter fantasy score: All 5 hitting categories */
                (0.25 * prs_pct.runs_pct + 
                0.25 * prs_pct.hr_pct + 
                0.25 * prs_pct.rbi_pct + 
                0.15 * prs_pct.sb_pct + 
                0.10 * prs_pct.avg_pct) AS batter_score,

                /* Pitcher fantasy score: K, QS, SVH heavy, with ERA/WHIP control */
                (0.25 * prs_pct.strikeouts_pct + 
                0.25 * prs_pct.qs_pct + 
                0.20 * GREATEST(prs_pct.sv_pct, prs_pct.hld_pct) + 
                0.15 * (100 - prs_pct.era_pct) + 
                0.15 * (100 - prs_pct.whip_pct)) AS pitcher_score
                
            FROM ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} prs_pct
            JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} pars
                ON pars.player_id = prs_pct.player_id AND pars.span_days = prs_pct.span_days AND pars.split_type = prs_pct.split_type AND pars.position = ?
            JOIN ${BASIC_ROLLING_STATS_TABLE} prs_raw ON prs_raw.player_id = prs_pct.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = ? AND prs_raw.position = ?
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} pls ON pls.player_id = prs_pct.player_id
            LEFT JOIN ${PLAYERS_TABLE} p ON p.player_id = prs_pct.player_id AND p.position = ?
            WHERE prs_pct.span_days = ? AND prs_pct.split_type = ? AND prs_pct.position = ?
                ${isRosteredFilter}
                ${positionFilter}
                ${minDataClause}
                ${teamFilter}
            ORDER BY ${orderByClause}
            LIMIT ? OFFSET ?;
        `;

        const [playerRankings] = await db.query(sqlQuery, params);
        return playerRankings;
    }

    async getNRFIRankings(startDate, endDate) {
        if (!startDate || !endDate) {
            throw new Error('Missing required parameters');
        }
        console.log(`getNRFIRankings - startDate: ${startDate}, endDate: ${endDate}`);
        const spanDays = 30;
        const playerFields = this.getPlayerFields();
        const pitcherScoringFields = this.getPitcherScoringFields();
        const pitcherAdvancedScoringFields = this.getPitcherAdvancedScoringFields();
        const [nrfiRankings] = await db.query(`
            SELECT 
                DATE_FORMAT(pp.game_date, '%Y-%m-%d') AS game_date, pp.team, pp.opponent, pp.home, pp.player_id, pp.accuracy, pp.nrfi_likelihood_score,
                ${playerFields}, 
                ${pitcherScoringFields},
                ${pitcherAdvancedScoringFields},
                team_rs_pct.nrfi_pct AS team_nrfi_pct,
                opponent_rs_pct.nrfi_pct AS opponent_nrfi_pct,
                prs_pct.nrfi_pct AS player_nrfi_pct,
                AVG(pp.nrfi_likelihood_score) OVER (PARTITION BY pp.game_id) AS avg_nrfi_score
            FROM ${PROBABLE_PITCHERS_TABLE} pp
            LEFT JOIN ${PLAYERS_TABLE} p ON p.player_id = pp.player_id
            LEFT JOIN ${PLAYER_LOOKUPS_TABLE} pl ON pl.player_id = pp.player_id
            LEFT JOIN ${PLAYER_ADVANCED_ROLLING_STATS_PERCENTILES_TABLE} pars 
                ON pars.player_id = pp.player_id AND pars.span_days = ? AND pars.split_type = 'overall' AND pars.position = 'P'
            LEFT JOIN ${BASIC_ROLLING_STATS_PERCENTILES_TABLE} prs_pct
                ON prs_pct.player_id = pp.player_id AND prs_pct.span_days = ? AND prs_pct.split_type = 'overall' AND prs_pct.position = 'P'
            LEFT JOIN ${BASIC_ROLLING_STATS_TABLE} prs_raw
                ON prs_raw.player_id = pp.player_id AND prs_raw.span_days = ? AND prs_raw.split_type = 'overall' AND prs_raw.position = 'P'
            RIGHT JOIN ${TEAM_ROLLING_STATS_PERCENTILES_TABLE} team_rs_pct
                ON team_rs_pct.team = pp.team AND team_rs_pct.span_days = ? AND team_rs_pct.split_type = 'overall'
            RIGHT JOIN ${TEAM_ROLLING_STATS_PERCENTILES_TABLE} opponent_rs_pct
                ON opponent_rs_pct.team = pp.opponent AND opponent_rs_pct.span_days = ? AND opponent_rs_pct.split_type = 'overall'
            WHERE pp.game_date BETWEEN ? AND ? 
                AND pp.nrfi_likelihood_score IS NOT NULL
            ORDER BY pp.game_date ASC, avg_nrfi_score DESC
            `, 
            [spanDays, spanDays, spanDays, spanDays, spanDays, startDate, endDate]
        );
        console.log(`Query returned ${nrfiRankings ? nrfiRankings.length : 0} rows`);
        return nrfiRankings;
    }
    }

module.exports = Player;