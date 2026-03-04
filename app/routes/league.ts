import express, { Request, Response } from 'express';
import Team from '../classes/team';
import YahooAPI from '../classes/yahooAPI';
import YahooOAuth from '../classes/yahooOAuth';
import Token from '../classes/token';
import { db } from '../db/db';
import { sendSuccess, sendError } from '../utils/functions';
import TokenController from '../controllers/tokenController';
import LeagueController from '../controllers/leagueController';
import League from '../classes/league';
import { LeagueFormRequest } from '../controllers/leagueController';
import { LeagueRequest } from '../classes/league';

const router = express.Router();
const token = new Token(db);
const yahooOAuth = new YahooOAuth();
const tokenController = new TokenController(token, yahooOAuth);
const team = new Team(db);
const league = new League(db);
const leagueController = new LeagueController(league);

router.get('/settings', async (req: Request, res: Response) => {
    try {
        const settings = await leagueController.getLeagueSettings();
        return sendSuccess(res, settings, 'League settings retrieved successfully');
    } catch (error) {
        console.error('Error in /league/settings:', error);
        return sendError(res, 500, 'Failed to get league settings');
    }
});

router.post('/upsert', async (req: Request, res: Response) => {
    try {
        const leagueForm: LeagueFormRequest = req.body;
        const accessToken = await tokenController.getOrRefreshToken();
        if (!accessToken.access_token) {
            return sendError(res, 401, 'No access token available');
        }
        const yahoo = new YahooAPI(accessToken.access_token);
        const leagueName = await yahoo.getLeagueName();
        const teams = await team.getAllLeagueTeams();
        if (teams.length === 0) {
            return sendError(res, 400, 'No teams found');
        }
        const leagueRequest: LeagueRequest = {
            id: leagueForm.id,
            name: leagueName ?? '',
            seasonYear: leagueForm.seasonYear,
            budgetTotal: leagueForm.budgetTotal,
            teamCount: teams.length,
            hitterBudgetPct: leagueForm.hitterBudgetPct,
            pitcherBudgetPct: leagueForm.pitcherBudgetPct,
            rosterSlots: leagueForm.rosterSlots,
            scoringCategories: leagueForm.scoringCategories,
        };
        await leagueController.upsertLeague(leagueRequest);
        return sendSuccess(res, null, 'League upserted successfully');
    } catch (error) {
        console.error('Error in /league/upsert:', error);
        return sendError(res, 500, 'Failed to upsert league');
    }
});

export default router;