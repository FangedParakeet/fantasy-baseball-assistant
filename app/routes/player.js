const express = require('express');
const router = express.Router();
const Player = require('../classes/player');
const { sendSuccess, sendError } = require('../utils');

// Search players
router.get('/search/players', async (req, res) => {
    try {
        const player = new Player();
        const rankings = await player.searchPlayers(req.query);
        sendSuccess(res, rankings, 'Players retrieved successfully');
    } catch (error) {
        console.error('Error searching players:', error);
        sendError(res, 500, 'Failed to search players');
    }
});

router.get('/search/pitchers/two-start', async (req, res) => {
    try {
        const player = new Player();
        const pitchers = await player.getAvailablePitchers(req.query, 'two-start');
        sendSuccess(res, pitchers, 'Two-start pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting two-start pitchers:', error);
        sendError(res, 500, 'Failed to get two-start pitchers');
    }
});

router.get('/search/pitchers/daily-streamer', async (req, res) => {
    try {
        const player = new Player();
        const pitchers = await player.getAvailablePitchers(req.query, 'daily-streamer');
        sendSuccess(res, pitchers, 'Daily streamer pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting daily streamer pitchers:', error);
        sendError(res, 500, 'Failed to get daily streamer pitchers');
    }
});

router.get('/search/pitchers/nrfi', async (req, res) => {
    try {
        console.log('NRFI query params:', req.query);
        const player = new Player();
        const pitchers = await player.getAvailablePitchers(req.query, 'nrfi');
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
        if (!teamId) {
            return sendError(res, 400, 'Team ID is required');
        }
        
        const player = new Player();
        const pitchers = await player.getProbablesStatsForTeam(teamId, req.query);
        sendSuccess(res, pitchers, 'Probable pitchers retrieved successfully');
    } catch (error) {
        console.error('Error getting probable pitchers:', error);
        sendError(res, 500, 'Failed to get probable pitchers');
    }
});

router.get('/preview/team/:teamId/stats/batting', async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!teamId) {
            return sendError(res, 400, 'Team ID is required');
        }
        
        const player = new Player();
        const stats = await player.getStatsForTeam(teamId, req.query, 'batting');
        sendSuccess(res, stats, 'Team batting stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting stats:', error);
        sendError(res, 500, 'Failed to get team batting stats');
    }
});

router.get('/preview/team/:teamId/stats/pitching', async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!teamId) {
            return sendError(res, 400, 'Team ID is required');
        }
        
        const player = new Player();
        const stats = await player.getStatsForTeam(teamId, req.query, 'pitching');
        sendSuccess(res, stats, 'Team pitching stats retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching stats:', error);
        sendError(res, 500, 'Failed to get team pitching stats');
    }
});

router.get('/preview/team/:teamId/schedule-strength/batting', async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!teamId) {
            return sendError(res, 400, 'Team ID is required');
        }
        
        const player = new Player();
        const scheduleStrength = await player.getScheduleStrengthForTeam(teamId, req.query, 'batting');
        sendSuccess(res, scheduleStrength, 'Team batting schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team batting schedule strength:', error);
        sendError(res, 500, 'Failed to get team batting schedule strength');
    }
});

router.get('/preview/team/:teamId/schedule-strength/pitching', async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!teamId) {
            return sendError(res, 400, 'Team ID is required');
        }
        
        const player = new Player();
        const scheduleStrength = await player.getScheduleStrengthForTeam(teamId, req.query, 'pitching');
        sendSuccess(res, scheduleStrength, 'Team pitching schedule strength retrieved successfully');
    } catch (error) {
        console.error('Error getting team pitching schedule strength:', error);
        sendError(res, 500, 'Failed to get team pitching schedule strength');
    }
});

module.exports = router;
