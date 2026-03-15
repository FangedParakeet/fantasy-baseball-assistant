// biome-ignore assist/source/organizeImports: biome is busted
import express, { type Request, type Response } from "express";
import Player from "../classes/player";
import type { 
    HitterScoringCategoryStats,
    PitcherScoringCategoryStats,
    ProbablePitcher,
    SpanDays,
    TwoStartPitcher,
    TeamScoringCategoryStats,
    TeamPositionValueStats,
} from "../classes/player";
import PlayerStatsController from "../controllers/playerStatsController";
import type {
	AvailablePitchersResult,
	DateQuery,
	ScheduleStrengthResult,
	SearchPlayersQuery,
	SearchPlayersResult,
	TeamStatsQuery,
	TeamStatsResult,
} from "../controllers/playerStatsController";
import db from "../db/db";
import { sendError, sendSuccess } from "../utils/functions";
import League from "../classes/league";

const router = express.Router();
const player = new Player(db);
const playerStatsController = new PlayerStatsController(player);
const league = new League(db);
// Search players
router.get('/search/players', async (req: Request, res: Response) => {
    try {
        const rankings: SearchPlayersResult[] = await playerStatsController.searchPlayers(req.query as unknown as SearchPlayersQuery);
        return sendSuccess(res, rankings, 'Players retrieved successfully');
    } catch (error) {
        console.error('Error searching players:', error);
        return sendError(res, 500, 'Failed to search players');
    }
});

router.get('/search/pitchers/two-start', async (req: Request, res: Response) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as unknown as DateQuery, 'two-start');
        return sendSuccess(res, pitchers, 'Two-start pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting two-start pitchers:', error);
        return sendError(res, 500, 'Failed to get two-start pitchers');
    }
});

router.get('/search/pitchers/daily-streamer', async (req: Request, res: Response) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as unknown as DateQuery, 'daily-streamer');
        return sendSuccess(res, pitchers, 'Daily streamer pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting daily streamer pitchers:', error);
        return sendError(res, 500, 'Failed to get daily streamer pitchers');
    }
});

router.get('/search/pitchers/nrfi', async (req: Request, res: Response) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as unknown as DateQuery, 'nrfi');
        return sendSuccess(res, pitchers, 'NRFI rankings retrieved successfully');
    } catch (error) {
        console.error('Error getting NRFI rankings:', error);
        return sendError(res, 500, 'Failed to get NRFI rankings');
    }
});

// Preview team
router.get('/preview/team/:teamId/probable-pitchers', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const pitchers: { twoStartPitchers: TwoStartPitcher[], probablePitchers: ProbablePitcher[] } = await playerStatsController.getProbablesStatsForTeam(id, req.query as unknown as DateQuery);
        return sendSuccess(res, pitchers, 'Probable pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting probable pitchers:', error);
        return sendError(res, 500, 'Failed to get probable pitchers');
    }
});

router.get('/preview/team/:teamId/stats/batting', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const stats: TeamStatsResult[] = await playerStatsController.getStatsForTeam(id, req.query as unknown as TeamStatsQuery, 'batting');
        return sendSuccess(res, stats, 'Team batting stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting stats:', error);
        return sendError(res, 500, 'Failed to get team batting stats');
    }
});

router.get('/preview/team/:teamId/stats/pitching', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const stats: TeamStatsResult[] = await playerStatsController.getStatsForTeam(id, req.query as unknown as TeamStatsQuery, 'pitching');
        return sendSuccess(res, stats, 'Team pitching stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching stats:', error);
        return sendError(res, 500, 'Failed to get team pitching stats');
    }
});

router.get('/preview/team/:teamId/schedule-strength/batting', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const scheduleStrength: ScheduleStrengthResult[] = await playerStatsController.getScheduleStrengthForTeam(id, req.query as unknown as DateQuery, 'batting');
        return sendSuccess(res, scheduleStrength, 'Team batting schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting schedule strength:', error);
        return sendError(res, 500, 'Failed to get team batting schedule strength');
    }
});

router.get('/preview/team/:teamId/schedule-strength/pitching', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const scheduleStrength: ScheduleStrengthResult[] = await playerStatsController.getScheduleStrengthForTeam(id, req.query as unknown as DateQuery, 'pitching');
        return sendSuccess(res, scheduleStrength, 'Team pitching schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching schedule strength:', error);
        return sendError(res, 500, 'Failed to get team pitching schedule strength');
    }
});

router.get('/preview/team/:teamId/value-stats/scoring', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const { modelId, spanDays } = req.query as unknown as {
            modelId: number;
            spanDays: number;
        };
        if (!modelId || !spanDays) {
            return sendError(res, 400, 'Valid model ID and span days are required');
        }

        const currentLeague = await league.getLeague();
        const teamScoringValueStats = await playerStatsController.getValueStatsForTeam(currentLeague.id, id, modelId, spanDays as SpanDays, 'scoring') as TeamScoringCategoryStats[];
        return sendSuccess(res, teamScoringValueStats, 'Team scoring value stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team scoring value stats:', error);
        return sendError(res, 500, 'Failed to get team scoring value stats');
    }
});

router.get('/preview/team/:teamId/value-stats/position', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const { modelId, spanDays } = req.query as unknown as {
            modelId: number;
            spanDays: number;
        };
        if (!modelId || !spanDays) {
            return sendError(res, 400, 'Valid model ID and span days are required');
        }

        const currentLeague = await league.getLeague();
        const teamPositionValueStats = await playerStatsController.getValueStatsForTeam(currentLeague.id, id, modelId, spanDays as SpanDays, 'position') as TeamPositionValueStats[];
        return sendSuccess(res, teamPositionValueStats, 'Team position value stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team position value stats:', error);
        return sendError(res, 500, 'Failed to get team position value stats');
    }
});

router.get('/preview/team/:teamId/value-stats/batting', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const modelId = Number(req.query.modelId);
        const spanDays = Number(req.query.spanDays);
        if (!Number.isInteger(modelId) || modelId < 1 || !Number.isInteger(spanDays) || spanDays < 1) {
            return sendError(res, 400, 'Valid model ID and span days are required');
        }

        const teamBattingValueStats = await playerStatsController.getScoringCategoryStatsForTeam(id, modelId, spanDays as SpanDays, 'batting') as HitterScoringCategoryStats[];
        return sendSuccess(res, teamBattingValueStats, 'Team batting value stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting value stats:', error);
        return sendError(res, 500, 'Failed to get team batting value stats');
    }
});

router.get('/preview/team/:teamId/value-stats/pitching', async (req: Request, res: Response) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const modelId = Number(req.query.modelId);
        const spanDays = Number(req.query.spanDays);
        if (!Number.isInteger(modelId) || modelId < 1 || !Number.isInteger(spanDays) || spanDays < 1) {
            return sendError(res, 400, 'Valid model ID and span days are required');
        }

        const teamPitchingValueStats = await playerStatsController.getScoringCategoryStatsForTeam(id, modelId, spanDays as SpanDays, 'pitching') as PitcherScoringCategoryStats[];
        return sendSuccess(res, teamPitchingValueStats, 'Team pitching value stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching value stats:', error);
        return sendError(res, 500, 'Failed to get team pitching value stats');
    }
});


export default router;
