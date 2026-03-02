import express, { Request, Response } from 'express';
const router = express.Router();
import db from '../db/db'; 
import Player from '../classes/player';
import { TwoStartPitcher, ProbablePitcher } from '../classes/player';
import PlayerStatsController from '../controllers/playerStatsController';
import { AvailablePitchersResult, DateQuery, SearchPlayersQuery, SearchPlayersResult, TeamStatsQuery, TeamStatsResult, ScheduleStrengthResult } from '../controllers/playerStatsController';
import { sendSuccess, sendError } from '../utils/functions';

const player = new Player(db);
const playerStatsController = new PlayerStatsController(player);

// Search players
router.get('/search/players', async (req: Request, res: Response) => {
    try {
        const rankings: SearchPlayersResult[] = await playerStatsController.searchPlayers(req.query as unknown as SearchPlayersQuery);
        sendSuccess(res, rankings, 'Players retrieved successfully');
    } catch (error) {
        console.error('Error searching players:', error);
        sendError(res, 500, 'Failed to search players');
    }
});

router.get('/search/pitchers/two-start', async (req: Request, res: Response) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as unknown as DateQuery, 'two-start');
        sendSuccess(res, pitchers, 'Two-start pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting two-start pitchers:', error);
        sendError(res, 500, 'Failed to get two-start pitchers');
    }
});

router.get('/search/pitchers/daily-streamer', async (req: Request, res: Response) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as unknown as DateQuery, 'daily-streamer');
        sendSuccess(res, pitchers, 'Daily streamer pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting daily streamer pitchers:', error);
        sendError(res, 500, 'Failed to get daily streamer pitchers');
    }
});

router.get('/search/pitchers/nrfi', async (req: Request, res: Response) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as unknown as DateQuery, 'nrfi');
        sendSuccess(res, pitchers, 'NRFI rankings retrieved successfully');
    } catch (error) {
        console.error('Error getting NRFI rankings:', error);
        sendError(res, 500, 'Failed to get NRFI rankings');
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
        sendSuccess(res, pitchers, 'Probable pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting probable pitchers:', error);
        sendError(res, 500, 'Failed to get probable pitchers');
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
        sendSuccess(res, stats, 'Team batting stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting stats:', error);
        sendError(res, 500, 'Failed to get team batting stats');
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
        sendSuccess(res, stats, 'Team pitching stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching stats:', error);
        sendError(res, 500, 'Failed to get team pitching stats');
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
        sendSuccess(res, scheduleStrength, 'Team batting schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting schedule strength:', error);
        sendError(res, 500, 'Failed to get team batting schedule strength');
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
        sendSuccess(res, scheduleStrength, 'Team pitching schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching schedule strength:', error);
        sendError(res, 500, 'Failed to get team pitching schedule strength');
    }
});

export default router;
