import express from 'express';
const router = express.Router();
import db from '../db/db'; 
import Player from '../classes/player';
import { TwoStartPitcher, ProbablePitcher } from '../classes/player';
import PlayerStatsController from '../controllers/playerStatsController';
import { AvailablePitchersResult, DateQuery, SearchPlayersQuery, SearchPlayersResult, TeamStatsQuery, TeamStatsResult, ScheduleStrengthResult } from '../controllers/playerStatsController';
import { sendSuccess, sendError } from '../utils';

const player = new Player(db);
const playerStatsController = new PlayerStatsController(player);


// Search players
router.get('/search/players', async (req, res) => {
    try {
        const rankings: SearchPlayersResult[] = await playerStatsController.searchPlayers(req.query as SearchPlayersQuery);
        sendSuccess(res, rankings, 'Players retrieved successfully');
    } catch (error) {
        console.error('Error searching players:', error);
        sendError(res, 500, 'Failed to search players');
    }
});

router.get('/search/pitchers/two-start', async (req, res) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as DateQuery, 'two-start');
        sendSuccess(res, pitchers, 'Two-start pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting two-start pitchers:', error);
        sendError(res, 500, 'Failed to get two-start pitchers');
    }
});

router.get('/search/pitchers/daily-streamer', async (req, res) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as DateQuery, 'daily-streamer');
        sendSuccess(res, pitchers, 'Daily streamer pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting daily streamer pitchers:', error);
        sendError(res, 500, 'Failed to get daily streamer pitchers');
    }
});

router.get('/search/pitchers/nrfi', async (req, res) => {
    try {
        const pitchers: AvailablePitchersResult[] = await playerStatsController.getAvailablePitchers(req.query as DateQuery, 'nrfi');
        sendSuccess(res, pitchers, 'NRFI rankings retrieved successfully');
    } catch (error) {
        console.error('Error getting NRFI rankings:', error);
        sendError(res, 500, 'Failed to get NRFI rankings');
    }
});

// Preview team
router.get('/preview/team/:teamId/probable-pitchers', async (req, res) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const pitchers: { twoStartPitchers: TwoStartPitcher[], probablePitchers: ProbablePitcher[] } = await playerStatsController.getProbablesStatsForTeam(id, req.query as DateQuery);
        sendSuccess(res, pitchers, 'Probable pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting probable pitchers:', error);
        sendError(res, 500, 'Failed to get probable pitchers');
    }
});

router.get('/preview/team/:teamId/stats/batting', async (req, res) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const stats: TeamStatsResult[] = await playerStatsController.getStatsForTeam(id, req.query as TeamStatsQuery, 'batting');
        sendSuccess(res, stats, 'Team batting stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting stats:', error);
        sendError(res, 500, 'Failed to get team batting stats');
    }
});

router.get('/preview/team/:teamId/stats/pitching', async (req, res) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const stats: TeamStatsResult[] = await playerStatsController.getStatsForTeam(id, req.query as TeamStatsQuery, 'pitching');
        sendSuccess(res, stats, 'Team pitching stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching stats:', error);
        sendError(res, 500, 'Failed to get team pitching stats');
    }
});

router.get('/preview/team/:teamId/schedule-strength/batting', async (req, res) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const scheduleStrength: ScheduleStrengthResult[] = await playerStatsController.getScheduleStrengthForTeam(id, req.query as DateQuery, 'batting');
        sendSuccess(res, scheduleStrength, 'Team batting schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting schedule strength:', error);
        sendError(res, 500, 'Failed to get team batting schedule strength');
    }
});

router.get('/preview/team/:teamId/schedule-strength/pitching', async (req, res) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }

        const scheduleStrength: ScheduleStrengthResult[] = await playerStatsController.getScheduleStrengthForTeam(id, req.query as DateQuery, 'pitching');
        sendSuccess(res, scheduleStrength, 'Team pitching schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching schedule strength:', error);
        sendError(res, 500, 'Failed to get team pitching schedule strength');
    }
});

export default router;
