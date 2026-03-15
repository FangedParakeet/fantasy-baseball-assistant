import express, { type Request, type Response } from "express";
import League, { type LeagueRequest } from "../classes/league";
import Team from "../classes/team";
import Token from "../classes/token";
import YahooAPI from "../classes/yahooAPI";
import YahooOAuth from "../classes/yahooOAuth";
import LeagueController, { type LeagueFormRequest } from "../controllers/leagueController";
import TokenController from "../controllers/tokenController";
import { db } from "../db/db";
import { sendError, sendSuccess } from "../utils/functions";
import Hydrator from "../classes/hydrator";
import RosterController from "../controllers/rosterController";

const router = express.Router();
const token = new Token(db);
const yahooOAuth = new YahooOAuth();
const tokenController = new TokenController(token, yahooOAuth);
const team = new Team(db);
const league = new League(db);
const leagueController = new LeagueController(league);
const hydrator = new Hydrator(db);

router.get('/settings', async (_req: Request, res: Response) => {
    try {
        const settings = await leagueController.getLeagueSettings();
        return sendSuccess(res, settings, 'League settings retrieved successfully');
    } catch (error) {
        console.error('Error in /league/settings:', error);
        return sendError(res, 500, 'Failed to get league settings');
    }
});

type ValueModelRow = { id: number; name: string; method: string; split_type: string; created_at: string };
router.get('/value-models', async (_req: Request, res: Response) => {
    try {
        const currentLeague = await league.getLeague();
        const [rows] = await db.query<ValueModelRow[]>(
            `SELECT id, name, method, split_type, created_at
             FROM draft_value_models
             WHERE league_id = ?
             ORDER BY created_at DESC`,
            [currentLeague.id]
        );
        const models = Array.isArray(rows) ? rows : [];
        return sendSuccess(res, models.map((m) => ({ id: Number(m.id), name: m.name, method: m.method, splitType: m.split_type, createdAt: m.created_at })), 'Value models retrieved successfully');
    } catch (error) {
        console.error('Error in /league/value-models:', error);
        return sendError(res, 500, 'Failed to get value models');
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
        const { name, seasonYear } = await yahoo.getLeagueNameAndSeason();
        const teams = await team.getAllLeagueTeams();
        if (teams.length === 0) {
            return sendError(res, 400, 'No teams found');
        }
        const leagueRequest: LeagueRequest = {
            id: leagueForm.id,
            name,
            seasonYear,
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

router.post('/reset', async (_req: Request, res: Response) => {
    try {
        const accessToken = await tokenController.getOrRefreshToken();
        if (!accessToken.access_token) {
            return sendError(res, 401, 'No access token available');
        }
        const yahoo = new YahooAPI(accessToken.access_token);
        const rosterController = new RosterController(yahoo, team, hydrator);
        await rosterController.hardRefreshAllLeagueTeams();
        return sendSuccess(res, null, 'League reset successfully');
    }
    catch (error) {
        console.error('Error in /league/reset:', error);
        return sendError(res, 500, 'Failed to reset league');
    }
});

export default router;