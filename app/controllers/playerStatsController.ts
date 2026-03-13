import type Player from "../classes/player";
import type {
	HitterAdvancedScoringFields,
	HitterBasicScoringFields,
	HitterContactOnBaseWatchlist,
	HitterPowerWatchlist,
	HitterScheduleStrength,
	HitterScoringWatchlist,
	HitterSpeedWatchlist,
	NRFIRanking,
	PitcherAdvancedScoringFields,
	PitcherBasicScoringFields,
	PitcherOrBatter,
	PitcherRelieverWatchlist,
	PitcherScheduleStrength,
	PitcherScoringWatchlist,
	PitcherStarterWatchlist,
	PlayerAdvancedScoringFields,
	PlayerFantasyRanking,
	PlayerScoringFields,
	Position,
	ProbablePitcher,
	SpanDays,
	TwoStartPitcher,
	WatchlistType,
} from "../classes/player";

export type DateQuery = {
    startDate: string | false;
    endDate: string | false;
    spanDays?: SpanDays;
}
export type TeamStatsQuery = {
    spanDays: SpanDays;
    orderBy?: PlayerScoringFields | PlayerAdvancedScoringFields | false;
}
export type SearchPlayersQuery = {
    positionType: PitcherOrBatter | WatchlistType;
    position: Position | false;
    isRostered: boolean;
    spanDays: SpanDays;
    page: number;
    orderBy: PlayerScoringFields | PlayerAdvancedScoringFields | false;
    isUserTeam: boolean;
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

    async searchPlayers(query: SearchPlayersQuery): Promise<SearchPlayersResult[]> {
        let {
            positionType,
            position,
            isRostered,
            spanDays,
            page,
            orderBy,
            isUserTeam,
        } = query;

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
            return await this.player.getPlayerFantasyRankings(page, spanDaysValid, positionType, isRostered, position, orderByValid, teamId);
        } else if ( positionType === 'speed' ) {
            return await this.player.getHitterSpeedWatchlist(page, spanDaysValid, position, teamId);
        } else if ( positionType === 'contact' ) {
            return await this.player.getHitterContactOnBaseWatchlist(page, spanDaysValid, position, teamId);
        } else if ( positionType === 'power' ) {
            return await this.player.getHitterPowerWatchlist(page, spanDaysValid, position, teamId);
        } else if ( positionType === 'starter' ) {
            return await this.player.getPitcherStarterWatchlist(page, spanDaysValid, teamId);
        } else if ( positionType === 'reliever' ) {
            return await this.player.getPitcherRelieverWatchlist(page, spanDaysValid, teamId);
        } else {
            throw new Error('Invalid position type');
        }
    }

    async getAvailablePitchers(
        query: DateQuery, 
        type: 'daily-streamer' | 'two-start' | 'nrfi'
    ): Promise<AvailablePitchersResult[]> {
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        if ( type === 'daily-streamer' ) {
            return await this.player.getAvailableDailyStreamingPitchers(startDate, endDate);
        } else if ( type === 'two-start' ) {
            return await this.player.getAvailableTwoStartPitchers(startDate, endDate);
        } else if ( type === 'nrfi' ) {
            return await this.player.getNRFIRankings(startDate, endDate);
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
        if ( type === 'batting' ) {
            return await this.player.getScoringStatsForTeamBatters(teamId, spanDays, orderBy as HitterBasicScoringFields | HitterAdvancedScoringFields | false);
        } else if ( type === 'pitching' ) {
            return await this.player.getScoringStatsForTeamPitchers(teamId, spanDays, orderBy as PitcherBasicScoringFields | PitcherAdvancedScoringFields | false);
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
        const {
            startDate,
            endDate,
        } = this.getDateRange(query);
        if ( type === 'batting' ) {
            return await this.player.getWeeklyHitterScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays);
        } else if ( type === 'pitching' ) {
            return await this.player.getWeeklyPitcherScheduleStrengthPreviewForTeam(teamId, startDate, endDate, spanDays);
        } else {
            throw new Error('Invalid type');
        }
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