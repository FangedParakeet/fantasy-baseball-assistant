const express = require('express');
const router = express.Router();
const Team = require('../classes/team');
const Yahoo = require('../classes/yahoo');
const Hydrator = require('../classes/hydrator');
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
    const hydrator = new Hydrator();
    const team = new Team(yahoo, hydrator);
    const result = await team.syncRosterForLeagueTeam(req.params.teamId);
    res.json(result);
  } catch (error) {
    console.error('Error in /league-teams/:teamId/sync-roster:', error);
    res.status(500).json({ error: 'Failed to sync roster', details: error.message });
  }
});

router.post('/league-teams/sync-all-rosters', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    const hydrator = new Hydrator();
    const team = new Team(yahoo, hydrator);
    const result = await team.syncAllLeagueTeams();
    res.json(result);
  } catch (error) {
    console.error('Error in /league-teams/sync-all-rosters:', error);
    res.status(500).json({ error: 'Failed to sync rosters', details: error.message });
  }
});

router.get('/debug-yahoo-teams', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const yahoo = new Yahoo(accessToken);
    
    // Get user's league key first
    const team = new Team();
    const leagueKey = await team.getMyLeagueKey();
    if (!leagueKey) {
      return res.status(400).json({ error: 'No league found' });
    }
    
    // Get league teams
    const leagueTeams = await team.getMyLeagueTeams(leagueKey);
    if (!leagueTeams || leagueTeams.length === 0) {
      return res.status(400).json({ error: 'No teams found in league' });
    }
    
    // Get roster from first team to see team abbreviations
    const firstTeam = leagueTeams[0];
    const rosterRes = await yahoo.getTeamRoster(firstTeam.team_key);
    
    // Extract unique team abbreviations from the roster
    const players = rosterRes.fantasy_content.team.roster.players.player;
    const teamAbbreviations = [...new Set(players.map(p => p.editorial_team_abbr).filter(Boolean))];
    
    // Get sample player data for each team
    const teamSamples = {};
    teamAbbreviations.forEach(abbr => {
      const samplePlayer = players.find(p => p.editorial_team_abbr === abbr);
      if (samplePlayer) {
        teamSamples[abbr] = {
          name: samplePlayer.name.full,
          player_key: samplePlayer.player_key,
          editorial_team_abbr: samplePlayer.editorial_team_abbr
        };
      }
    });
    
    res.json({
      success: true,
      team_abbreviations: teamAbbreviations,
      team_samples: teamSamples,
      total_players: players.length,
      sample_roster_response: {
        team_name: firstTeam.name,
        team_key: firstTeam.team_key,
        players_count: players.length
      }
    });
  } catch (error) {
    console.error('Error in /debug-yahoo-teams:', error);
    res.status(500).json({ error: 'Failed to debug Yahoo teams', details: error.message });
  }
});

module.exports = router;
