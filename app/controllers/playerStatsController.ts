import type Player from "../classes/player";
import type {
	AdvancedRollingRow,
	GameLogRow,
	HitterAdvancedScoringFields,
	HitterBasicScoringFields,
	HitterContactOnBaseWatchlist,
	HitterPowerWatchlist,
	HitterScheduleStrength,
	HitterScoringCategoryStats,
	HitterScoringWatchlist,
	HitterSpeedWatchlist,
	MatchupContext,
	NRFIRanking,
	PitcherAdvancedScoringFields,
	PitcherBasicScoringFields,
	PitcherOrBatter,
	PitcherRelieverWatchlist,
	PitcherScheduleStrength,
	PitcherScoringCategoryStats,
	PitcherScoringWatchlist,
	PitcherStarterWatchlist,
	PlayerAdvancedScoringFields,
	PlayerFantasyRanking,
	PlayerScoringCategoryStats,
	PlayerScoringFields,
	Position,
	ProbablePitcher,
	RecentSplits,
	SavantProfileRow,
	SpanDays,
	StreakStatus,
	TeamPositionValueStats,
	TeamScoringCategoryStats,
	TwoStartPitcher,
	WatchlistType,
} from "../classes/player";
import { parseJsonArray, parseNumberRequired } from "../utils/functions";

export type DateQuery = {
    startDate: string | false;
    endDate: string | false;
    spanDays?: SpanDays;
    season?: number;
}
export type TeamStatsQuery = {
    spanDays: SpanDays;
    orderBy?: PlayerScoringFields | PlayerAdvancedScoringFields | false;
    season?: number;
}
export type SearchPlayersQuery = {
    positionType: PitcherOrBatter | WatchlistType;
    position: Position | false;
    isRostered: boolean;
    spanDays: SpanDays;
    page: number;
    orderBy: PlayerScoringFields | PlayerAdvancedScoringFields | false;
    isUserTeam: boolean;
    season?: number;
}
export type SearchPlayersResult = PlayerFantasyRanking 
    | HitterSpeedWatchlist 
    | HitterContactOnBaseWatchlist 
    | HitterPowerWatchlist 
    | PitcherStarterWatchlist 
    | PitcherRelieverWatchlist;

export type AvailablePitchersResult = ProbablePitcher | TwoStartPitcher | NRFIRanking;
export type TeamStatsResult = HitterScoringWatchlist | PitcherScoringWatchlist;
export type ScheduleStrengthResult = PitcherScheduleStrength | HitterScheduleStrength;

/** Valid spanDays values for runtime validation (SpanDays is only a type). */
const SPAN_DAYS_SET = new Set<SpanDays>([7, 14, 30]);
const POSITION_TYPE_SET = new Set<PitcherOrBatter | WatchlistType>(['B', 'P', 'speed', 'contact', 'power', 'starter', 'reliever']);
const ORDER_BY_SET = new Set<PlayerScoringFields | PlayerAdvancedScoringFields>(['strikeouts', 'era', 'whip', 'qs', 'sv', 'hld', 'ip', 'k_per_9', 'bb_per_9', 'fip', 'runs', 'hr', 'rbi', 'sb', 'avg', 'hits', 'abs', 'obp', 'slg', 'ops', 'k_rate', 'bb_rate', 'iso', 'wraa']);

class PlayerStatsController {
    constructor(private readonly player: Player) {}

    private resolveSeasonYear(season?: number | string): number {
        const parsed = season != null ? Number(season) : NaN;
        return Number.isNaN(parsed) ? new Date().getFullYear() : parsed;
    }

    async getScoringCategoryStatsForPlayers(
        rawPlayerIds: number[] | string,
        modelId: number,
        spanDays: SpanDays = 14,
    ): Promise<PlayerScoringCategoryStats[]> {
        // Validate query parameters
        let playerIds = Array.isArray(rawPlayerIds) ? rawPlayerIds : parseJsonArray(rawPlayerIds as string, 'playerIds');
        playerIds = playerIds.map(id => parseNumberRequired(id, 'playerId')) as number[];

        if ( !playerIds?.length ) {
            throw new Error('Player IDs are required');
        }
        const modelIdValid = parseNumberRequired(modelId, 'modelId');
        const spanDaysValid = parseNumberRequired(spanDays, 'spanDays') as SpanDays;

        return await this.player.getScoringCategoryStatsForPlayers(playerIds as number[], modelIdValid, spanDaysValid as SpanDays);
    }

    async getScoringCategoryStatsForTeam(
        teamId: number,
        modelId: number,
        spanDays: SpanDays = 14,
        type: 'batting' | 'pitching'
    ): Promise<HitterScoringCategoryStats[] | PitcherScoringCategoryStats[]> {
        // Validate query parameters
        const teamIdValid = parseNumberRequired(teamId, 'teamId');
        const modelIdValid = parseNumberRequired(modelId, 'modelId');
        const spanDaysValid = parseNumberRequired(spanDays, 'spanDays') as SpanDays;
        if ( !type ) {
            throw new Error('Type is required');
        }
        if ( type === 'batting' ) {
            return await this.player.getScoringCategoryStatsForTeamHitters(teamIdValid, modelIdValid, spanDaysValid);
        } else if ( type === 'pitching' ) {
            return await this.player.getScoringCategoryStatsForTeamPitchers(teamIdValid, modelIdValid, spanDaysValid);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getValueStatsForTeam(
        leagueId: number,
        teamId: number,
        modelId: number,
        spanDays: SpanDays = 14,
        type: 'scoring' | 'position'
    ): Promise<TeamScoringCategoryStats[] | TeamPositionValueStats[]> {
        // Validate query parameters
        const leagueIdValid = parseNumberRequired(leagueId, 'leagueId');
        const teamIdValid = parseNumberRequired(teamId, 'teamId');
        const modelIdValid = parseNumberRequired(modelId, 'modelId');
        const spanDaysValid = parseNumberRequired(spanDays, 'spanDays') as SpanDays;
        if ( !type ) {
            throw new Error('Type is required');
        }
        if ( type === 'scoring' ) {
            return await this.player.getScoringCategoryStatsForTeam(leagueIdValid, teamIdValid, modelIdValid, spanDaysValid);
        } else if ( type === 'position' ) {
            return await this.player.getPositionValueStatsForTeam(leagueIdValid, teamIdValid, modelIdValid, spanDaysValid);
        } else {
            throw new Error('Invalid type');
        }
    }

    async searchPlayers(query: SearchPlayersQuery): Promise<SearchPlayersResult[]> {
        let {
            positionType,
            position,
            isRostered,
            spanDays,
            page,
            orderBy,
            isUserTeam,
            season,
        } = query;
        const seasonYear = this.resolveSeasonYear(season);

        // Coerce query string 'false'/'true' to booleans (req.query sends strings)
        const orderByStr = orderBy as unknown;
        const positionStr = position as unknown;
        if ( orderByStr === 'false' || orderByStr === '' || orderByStr == null ) orderBy = false;
        if ( positionStr === 'false' || positionStr === '' || positionStr == null ) position = false;

        const isRosteredStr = isRostered as unknown;
        isRostered = isRosteredStr === true || isRosteredStr === 'true';
        const isUserTeamStr = isUserTeam as unknown;
        isUserTeam = isUserTeamStr === true || isUserTeamStr === 'true';

        const teamId = isUserTeam ? await this.player.getUserTeamId() : false;

        // Validate query parameters
        // page could be a string, so convert to number and validate
        page = Number(page);
        if ( Number.isNaN(page) || page < 1 ) {
            throw new Error('Invalid page parameter');
        }
        // spanDays could be a string from query, so convert to number and validate
        const spanDaysNum = Number(spanDays);
        if ( Number.isNaN(spanDaysNum) || !SPAN_DAYS_SET.has(spanDaysNum as SpanDays) ) {
            throw new Error('Invalid spanDays parameter');
        }
        const spanDaysValid = spanDaysNum as SpanDays;

        if ( !POSITION_TYPE_SET.has(positionType) ) {
            throw new Error('Invalid position type');
        }
        if ( orderBy !== false && !ORDER_BY_SET.has(orderBy as PlayerScoringFields | PlayerAdvancedScoringFields) ) {
            throw new Error('Invalid orderBy parameter');
        }
        const orderByValid = orderBy as PlayerScoringFields | PlayerAdvancedScoringFields | false;

        if ( positionType === 'B' || positionType === 'P' ) {
            return await this.player.getPlayerFantasyRankings(page, spanDaysValid, positionType, isRostered, position, orderByValid, teamId, seasonYear);
        } else if ( positionType === 'speed' ) {
            return await this.player.getHitterSpeedWatchlist(page, spanDaysValid, position, teamId, seasonYear);
        } else if ( positionType === 'contact' ) {
            return await this.player.getHitterContactOnBaseWatchlist(page, spanDaysValid, position, teamId, seasonYear);
        } else if ( positionType === 'power' ) {
            return await this.player.getHitterPowerWatchlist(page, spanDaysValid, position, teamId, seasonYear);
        } else if ( positionType === 'starter' ) {
            return await this.player.getPitcherStarterWatchlist(page, spanDaysValid, teamId, seasonYear);
        } else if ( positionType === 'reliever' ) {
            return await this.player.getPitcherRelieverWatchlist(page, spanDaysValid, teamId, seasonYear);
        } else {
            throw new Error('Invalid position type');
        }
    }

    async getAvailablePitchers(
        query: DateQuery,
        type: 'daily-streamer' | 'two-start' | 'nrfi'
    ): Promise<AvailablePitchersResult[]> {
        const seasonYear = this.resolveSeasonYear(query.season);
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        if ( type === 'daily-streamer' ) {
            return await this.player.getAvailableDailyStreamingPitchers(startDate, endDate, seasonYear);
        } else if ( type === 'two-start' ) {
            return await this.player.getAvailableTwoStartPitchers(startDate, endDate, seasonYear);
        } else if ( type === 'nrfi' ) {
            return await this.player.getNRFIRankings(startDate, endDate, seasonYear);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getProbablesStatsForTeam(
        teamId: number, 
        query: DateQuery
    ): Promise<{ twoStartPitchers: TwoStartPitcher[], probablePitchers: ProbablePitcher[] }> {
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        const twoStartPitchers = await this.player.getTwoStartPitchersForTeam(teamId, startDate, endDate);
        const probablePitchers = await this.player.getProbablePitchersForTeam(teamId, startDate, endDate);
                
        return {
            twoStartPitchers,
            probablePitchers,
        };
    }

    async getStatsForTeam(
        teamId: number,
        query: TeamStatsQuery,
        type: 'batting' | 'pitching'
    ): Promise<TeamStatsResult[]> {
        const {
            spanDays,
            orderBy,
        } = query;
        const seasonYear = this.resolveSeasonYear(query.season);
        if ( type === 'batting' ) {
            return await this.player.getScoringStatsForTeamBatters(teamId, spanDays, orderBy as HitterBasicScoringFields | HitterAdvancedScoringFields | false, seasonYear);
        } else if ( type === 'pitching' ) {
            return await this.player.getScoringStatsForTeamPitchers(teamId, spanDays, orderBy as PitcherBasicScoringFields | PitcherAdvancedScoringFields | false, seasonYear);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getScheduleStrengthForTeam(
        teamId: number,
        query: DateQuery,
        type: 'batting' | 'pitching'
    ): Promise<ScheduleStrengthResult[]> {
        const {
            spanDays: querySpanDays,
        } = query;
        const spanDays = querySpanDays ?? 14;
        const seasonYear = this.resolveSeasonYear(query.season);
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        if ( type === 'batting' ) {
            return await this.player.getWeeklyHitterScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays, seasonYear);
        } else if ( type === 'pitching' ) {
            return await this.player.getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays, seasonYear);
        } else {
            throw new Error('Invalid type');
        }
    }

    async getPlayerGameLogs(
        rawPlayerIds: number[] | number,
        lastN: number = 10,
        season?: number,
    ): Promise<GameLogRow[]> {
        const playerIds = Array.isArray(rawPlayerIds) ? rawPlayerIds : [rawPlayerIds];
        const ids = playerIds.map(id => parseNumberRequired(id, 'player_id'));
        if (!ids.length) throw new Error('player_id or player_ids required');
        const n = Math.max(1, Math.min(Number(lastN) || 10, 50));
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayerGameLogs(ids, n, seasonYear);
    }

    async getPlayerSavantProfile(
        playerId: number,
        season?: number,
    ): Promise<SavantProfileRow[]> {
        const id = parseNumberRequired(playerId, 'player_id');
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayerSavantProfile(id, seasonYear);
    }

    async getPlayerAdvancedRolling(
        playerId: number,
        spanDays: number = 14,
        season?: number,
        position?: string,
    ): Promise<AdvancedRollingRow[]> {
        const id = parseNumberRequired(playerId, 'player_id');
        const spanDaysNum = Number(spanDays);
        if (!SPAN_DAYS_SET.has(spanDaysNum as SpanDays)) throw new Error('span_days must be 7, 14, or 30');
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayerAdvancedRolling(id, spanDaysNum as SpanDays, seasonYear, position);
    }

    async getPlayerMatchupContext(
        playerId: number,
        gameDate?: string,
        season?: number,
    ): Promise<MatchupContext | null> {
        const id = parseNumberRequired(playerId, 'player_id');
        const date = gameDate || new Date().toISOString().split('T')[0];
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayerMatchupContext(id, date, seasonYear);
    }

    async getPlayerRecentSplits(
        playerId: number,
        season?: number,
    ): Promise<RecentSplits> {
        const id = parseNumberRequired(playerId, 'player_id');
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayerRecentSplits(id, seasonYear);
    }

    async getPlayersByIds(
        rawPlayerIds: number[],
        spanDays: number = 14,
        season?: number,
    ): Promise<PlayerFantasyRanking[]> {
        const playerIds = rawPlayerIds.map(id => parseNumberRequired(id, 'player_id'));
        if (playerIds.length < 2 || playerIds.length > 5) throw new Error('player_ids must have 2–5 items');
        const spanDaysNum = Number(spanDays);
        if (!SPAN_DAYS_SET.has(spanDaysNum as SpanDays)) throw new Error('span_days must be 7, 14, or 30');
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayersByIds(playerIds, spanDaysNum as SpanDays, seasonYear);
    }

    async getPlayerStreakStatus(
        playerId: number,
        season?: number,
    ): Promise<StreakStatus> {
        const id = parseNumberRequired(playerId, 'player_id');
        const seasonYear = this.resolveSeasonYear(season);
        return this.player.getPlayerStreakStatus(id, seasonYear);
    }

    getDateRange(query: DateQuery): { startDate: string, endDate: string } {
        let {
            startDate,
            endDate,
        } = query;
        if ( ! startDate ) {
            const start = new Date();
            start.setDate(start.getDate() - start.getDay());
            // Format default date
            startDate = start.toISOString().split('T')[0];
        }
        if ( ! endDate ) {
            const end = new Date();
            end.setDate(end.getDate() - end.getDay() + 6);
            // Format default date
            endDate = end.toISOString().split('T')[0];
        }
        
        // If dates are already strings in YYYY-MM-DD format, use them as-is
        // The database stores dates in this format, so no conversion needed
        return {
            startDate,
            endDate,
        };
    }
}

export default PlayerStatsController;