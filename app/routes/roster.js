const express = require('express');
const router = express.Router();
const Team = require('../classes/team');
const Yahoo = require('../classes/yahoo');
const Hydrator = require('../classes/hydrator');
const { getValidAccessToken, sendSuccess, sendError } = require('../utils');

router.post('/sync-roster', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const team = new Team(yahoo);
    
    const result = await team.syncMyRoster();
    sendSuccess(res, result, 'Roster synced successfully');
  } catch (error) {
    console.error('Error syncing roster:', error);
    sendError(res, 401, error.message);
  }
});

router.get('/my-roster', async (req, res) => {
    try {
      const team = new Team();
      const result = await team.getMyRoster();
      sendSuccess(res, result, 'Roster retrieved successfully');
    } catch (error) {
      console.error('Error in /my-roster:', error);
      sendError(res, 500, 'Failed to get roster');
    }
});

router.get('/league-teams', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const team = new Team(yahoo);
    const result = await team.getAllLeagueTeams();
    sendSuccess(res, result, 'League teams retrieved successfully');
  } catch (error) {
    console.error('Error in /league-teams:', error);
    sendError(res, 500, 'Failed to get league teams');
  }
});

router.get('/league-teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!teamId) {
      return sendError(res, 400, 'Team ID is required');
    }
    
    const team = new Team();
    const result = await team.getRosterForTeam(teamId);
    sendSuccess(res, result, 'Team roster retrieved successfully');
  } catch (error) {
    console.error('Error in /league-teams/:teamId:', error);
    sendError(res, 500, 'Failed to get team roster');
  }
});

router.post('/league-teams/:teamId/sync-roster', async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!teamId) {
      return sendError(res, 400, 'Team ID is required');
    }
    
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const hydrator = new Hydrator();
    const team = new Team(yahoo, hydrator);
    const result = await team.syncRosterForLeagueTeam(teamId);
    sendSuccess(res, result, 'Team roster synced successfully');
  } catch (error) {
    console.error('Error in /league-teams/:teamId/sync-roster:', error);
    sendError(res, 500, 'Failed to sync team roster');
  }
});

router.post('/league-teams/sync-all-rosters', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const hydrator = new Hydrator();
    const team = new Team(yahoo, hydrator);
    const result = await team.syncAllLeagueTeams();
    sendSuccess(res, result, 'All league rosters synced successfully');
  } catch (error) {
    console.error('Error in /league-teams/sync-all-rosters:', error);
    sendError(res, 500, 'Failed to sync all rosters');
  }
});

module.exports = router;
