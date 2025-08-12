const express = require('express');
const router = express.Router();
const Team = require('../classes/team');
const Yahoo = require('../classes/yahoo');
const { getValidAccessToken } = require('../utils');

router.post('/sync-roster', async (req, res) => {
 
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const team = new Team(yahoo);
    
    const result = await team.syncMyRoster();
    res.json(result);
  } catch (error) {
    console.error('Error syncing roster:', error);
    res.status(401).json({ error: error.message });
  }
});

router.get('/my-roster', async (req, res) => {

    try {
      const team = new Team();
      const result = await team.getMyRoster();
      res.json(result)
    } catch (error) {
      console.error('Error in /my-roster:', error);
      res.status(500).json({ error: 'Failed to get roster', details: error.message });
    }
});

router.get('/league-teams', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const team = new Team(yahoo);
    const result = await team.getAllLeagueTeams();
    res.json(result);
  } catch (error) {
    console.error('Error in /league-teams:', error);
    res.status(500).json({ error: 'Failed to get league teams', details: error.message });
  }
});

router.get('/league-teams/:teamId', async (req, res) => {
  try {
    const team = new Team();
    const result = await team.getRosterForTeam(req.params.teamId);
    res.json(result);
  } catch (error) {
    console.error('Error in /league-teams/:teamId:', error);
    res.status(500).json({ error: 'Failed to get league teams', details: error.message });
  }
});

router.post('/league-teams/:teamId/sync-roster', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const team = new Team(yahoo);
    const result = await team.syncRosterForLeagueTeam(req.params.teamId);
    res.json(result);
  } catch (error) {
    console.error('Error in /league-teams/:teamId/sync-roster:', error);
    res.status(500).json({ error: 'Failed to sync roster', details: error.message });
  }
});

router.post('/all-league-teams/sync-rosters', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const team = new Team(yahoo);
    const result = await team.syncAllLeagueTeams();
    res.json(result);
  } catch (error) {
    console.error('Error in /all-league-teams/sync-rosters:', error);
    res.status(500).json({ error: 'Failed to sync rosters', details: error.message });
  }
});

module.exports = router;
