import express from 'express';
import Team from '../classes/team';
import YahooAPI from '../classes/yahooAPI';
import YahooOAuth from '../classes/yahooOAuth';
import Token from '../classes/token';
import Hydrator from '../classes/hydrator';
import { db } from '../db/db';
import { sendSuccess, sendError } from '../utils';
import TokenController from '../controllers/tokenController';
import RosterController from '../controllers/rosterController';

const router = express.Router();
const token = new Token(db);
const yahooOAuth = new YahooOAuth();
const tokenController = new TokenController(token, yahooOAuth);
const hydrator = new Hydrator(db);
const team = new Team(db);

router.post('/sync-roster', async (req, res) => {
    try {
        const accessToken = await tokenController.getOrRefreshToken();
        if (!accessToken.access_token) {
            return sendError(res, 401, 'No access token available');
        }
        const yahoo = new YahooAPI(accessToken.access_token);
        const rosterController = new RosterController(yahoo, team, hydrator);
        const result = await rosterController.syncMyRoster();
        sendSuccess(res, result, 'Roster synced successfully');
    } catch (error) {
        console.error('Error syncing my roster:', error);
        sendError(res, 500, 'Failed to sync my roster');
    }
});

router.get('/my-roster', async (req, res) => {
    try {
        const result = await team.getMyRoster();
        sendSuccess(res, result, 'Roster retrieved successfully');
    } catch (error) {
        console.error('Error in /my-roster:', error);
        sendError(res, 500, 'Failed to get roster');
    }
});

router.get('/league-teams', async (req, res) => {
  try {
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
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }
        
        const result = await team.getRosterForTeam(id);
        sendSuccess(res, result, 'Team roster retrieved successfully');
    } catch (error) {
        console.error('Error in /league-teams/:teamId:', error);
        sendError(res, 500, 'Failed to get team roster');
    }
});

router.post('/league-teams/:teamId/sync-roster', async (req, res) => {
    try {
        const { teamId } = req.params;
        const id = teamId != null ? Number(teamId) : NaN;
        if (!teamId || Number.isNaN(id)) {
            return sendError(res, 400, 'Valid team ID is required');
        }
        
        const accessToken = await tokenController.getOrRefreshToken();
        if (!accessToken.access_token) {
            return sendError(res, 401, 'No access token available');
        }
        const yahoo = new YahooAPI(accessToken.access_token);
        const rosterController = new RosterController(yahoo, team, hydrator);
        await rosterController.syncRosterForLeagueTeam(id);
        const result = await team.getRosterForTeam(id);
        sendSuccess(res, result, 'Team roster synced successfully');
    } catch (error) {
        console.error('Error in /league-teams/:teamId/sync-roster:', error);
        sendError(res, 500, 'Failed to sync team roster');
    }
});

router.post('/league-teams/sync-all-rosters', async (req, res) => {
    try {
        const accessToken = await tokenController.getOrRefreshToken();
        if (!accessToken.access_token) {
            return sendError(res, 401, 'No access token available');
        }
        const yahoo = new YahooAPI(accessToken.access_token);
        const rosterController = new RosterController(yahoo, team, hydrator);
        await rosterController.syncAllLeagueTeams();
        const result = await team.getAllLeagueTeams();
        sendSuccess(res, result, 'All league rosters synced successfully');
    } catch (error) {
        console.error('Error in /league-teams/sync-all-rosters:', error);
        sendError(res, 500, 'Failed to sync all rosters');
    }
});

export default router;
