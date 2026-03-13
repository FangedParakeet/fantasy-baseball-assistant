import express, { type Request, type Response } from "express";
import { type BoardQuery, getBoard } from "../controllers/boardController";
import {
	getState,
	getTeamNeeds,
	makePurchase,
	movePurchase,
	recomputeDraftSupply,
	recomputeDraftTeamState,
	simulatePurchase,
	undoPurchase,
} from "../controllers/draftLiveController";
import { db, executeInTransaction } from "../db/db";
import { sendError, sendSuccess } from "../utils/functions";
import { Logger } from "../utils/logger";

export const draftLiveRoutes = express.Router();

interface DraftLeagueRow {
	league_id: number;
}

interface DraftValueModelRow {
	id: number;
	name: string;
	method: string;
	split_type: string | null;
	created_at: string;
}

function parseDraftId(param: string | string[] | undefined): number | null {
	const s = Array.isArray(param) ? param[0] : param;
	if (s === undefined) return null;
	const n = Number(s);
	return Number.isInteger(n) && n > 0 ? n : null;
}

function parsePurchaseId(param: string | string[] | undefined): number | null {
	const s = Array.isArray(param) ? param[0] : param;
	if (s === undefined) return null;
	const n = Number(s);
	return Number.isInteger(n) && n > 0 ? n : null;
}

draftLiveRoutes.get("/:draftId/models", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	try {
		const [draftRows] = await db.query<DraftLeagueRow[]>(
			`SELECT league_id FROM drafts WHERE id = ? LIMIT 1`,
			[draftId]
		);
		const draftRow = Array.isArray(draftRows) ? draftRows[0] : null;
		if (!draftRow) return sendError(res, 404, "Draft not found");
		const leagueId = Number(draftRow.league_id);
		const [modelRows] = await db.query<DraftValueModelRow[]>(
			`SELECT id, name, method, split_type, created_at
			 FROM draft_value_models
			 WHERE league_id = ?
			 ORDER BY created_at DESC`,
			[leagueId]
		);
		const models = Array.isArray(modelRows) ? modelRows : [];
		return sendSuccess(res, {
			draftId,
			leagueId,
			models: models.map((m: DraftValueModelRow) => ({
				id: Number(m.id),
				name: m.name,
				method: m.method,
				splitType: m.split_type,
				createdAt: m.created_at,
			})),
		}, "Models fetched successfully");
	} catch (err) {
		Logger.error(err, "GET /:draftId/models");
		return sendError(res, 500, "Failed to get models");
	}
});

draftLiveRoutes.post("/:draftId/recompute", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	try {
		await executeInTransaction((conn) => recomputeDraftTeamState(conn, draftId));
		return sendSuccess(res, { ok: true }, "Draft team state recomputed successfully");
	} catch (err) {
		Logger.error(err, "POST /:draftId/recompute");
		return sendError(res, 500, "Failed to recompute draft team state");
	}
});

draftLiveRoutes.get("/:draftId/board", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const query = req.query as BoardQuery;
	try {
		const result = await getBoard(db, draftId, query);
		return sendSuccess(res, {
			ok: true,
			draftId,
			modelId: query.modelId,
			total: result.total,
			limit: query.limit,
			offset: query.offset,
			players: result.rows,
		}, "Board fetched successfully");
	} catch (err) {
		Logger.error(err, "GET /:draftId/board");
		return sendError(res, 500, "Failed to get board");
	}
});

draftLiveRoutes.get("/:draftId/state", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const rawModelId = req.query.modelId;
	const modelId = rawModelId === undefined || rawModelId === null
		? 1
		: Number(rawModelId);
	if (!Number.isInteger(modelId) || modelId < 1) return sendError(res, 400, "Invalid model ID");
	const recompute = String(req.query.recompute ?? "false").toLowerCase() === "true";
	try {
		if (recompute) {
			await executeInTransaction(async (conn) => {
				await recomputeDraftTeamState(conn, draftId);
				await recomputeDraftSupply(conn, draftId, modelId);
			});
		}
		const state = await getState(db, draftId, modelId);
		return sendSuccess(res, {
			ok: true,
			draft: {
				draftId,
				leagueId: state.leagueId,
				isActive: state.isActive,
				createdAt: state.createdAt,
			},
			leagueSettings: {
				budgetTotal: state.budgetTotal,
				teamCount: state.teamCount,
				hitterBudgetPct: state.hitterBudgetPct,
				pitcherBudgetPct: state.pitcherBudgetPct,
			},
			modelId,
			draftTeams: state.draftTeams,
			teamStates: state.teamStates,
			keepers: state.keepers,
			purchases: state.purchases,
			last10: state.last10,
			supply: {
				positionSupply: state.positionSupply,
				tierSupply: state.tierSupply,
				positionReplacement: state.positionReplacement,
			},
		}, "Draft state fetched successfully");
	} catch (e) {
		Logger.error(e, "GET /:draftId/state");
		const message = e instanceof Error ? e.message : "Failed to get draft state";
		const status = message === "Invalid payload" ? 400 : 500;
		return sendError(res, status, message);
	}
});

draftLiveRoutes.post("/:draftId/purchases", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const { playerPk, draftTeamId, price, modelId } = req.body ?? {};
	try {
		const purchase = await executeInTransaction((conn) =>
			makePurchase(conn, draftId, draftTeamId, modelId, playerPk, price)
		);
		return sendSuccess(res, {
			ok: true,
			purchase: {
				draftId,
				draftTeamId,
				playerPk,
				price,
				sequenceNo: purchase.nextSeq,
			},
			teamState: purchase.teamState,
			last10: purchase.last10,
		}, "Purchase made successfully");
	} catch (e) {
		Logger.error(e, "POST /:draftId/purchases");
		const message = e instanceof Error ? e.message : "Failed to make purchase";
		const status = message === "Invalid payload" ? 400 : 500;
		return sendError(res, status, message);
	}
});

draftLiveRoutes.post("/:draftId/purchases/:purchaseId/undo", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const rawModelId = req.body?.modelId;
	const modelId = rawModelId === undefined || rawModelId === null
		? 1
		: Number(rawModelId);
	if (!Number.isInteger(modelId) || modelId < 1) return sendError(res, 400, "Invalid model ID");
	try {
		const result = await executeInTransaction((conn) =>
			undoPurchase(conn, draftId, modelId)
		);
		return sendSuccess(res, {
			ok: true,
			undone: {
				id: Number(result.lastPurchase.id),
				draftTeamId: Number(result.lastPurchase.draft_team_id),
				playerPk: Number(result.lastPurchase.player_pk),
				price: Number(result.lastPurchase.price),
				sequenceNo: Number(result.lastPurchase.sequence_no),
			},
			teamState: result.teamState,
			last10: result.last10,
		}, "Purchase undone successfully");
	} catch (e) {
		Logger.error(e, "POST /:draftId/purchases/:purchaseId/undo");
		const message = e instanceof Error ? e.message : "Failed to undo purchase";
		const status = message === "Invalid payload" ? 400 : 500;
		return sendError(res, status, message);
	}
});

type MoveDirection = "up" | "down";

draftLiveRoutes.post("/:draftId/purchases/:purchaseId/move", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const purchaseId = parsePurchaseId(req.params.purchaseId);
	if (purchaseId === null) return sendError(res, 400, "Invalid purchase ID");
	const direction: MoveDirection = String(req.body?.direction ?? "").toLowerCase() as MoveDirection;
	if (!["up", "down"].includes(direction)) return sendError(res, 400, "Invalid direction");
	try {
		const result = await executeInTransaction((conn) =>
			movePurchase(conn, draftId, purchaseId, direction)
		);
		return sendSuccess(res, {
			ok: true,
			moved: true,
			purchaseId,
			direction,
			swappedPurchaseId: result.swappedPurchaseId,
			last10: result.last10,
		}, "Purchase moved successfully");
	} catch (e) {
		Logger.error(e, "POST /:draftId/purchases/:purchaseId/move");
		const message = e instanceof Error ? e.message : "Failed to move purchase";
		const status = message === "Invalid payload" ? 400 : 500;
		return sendError(res, status, message);
	}
});

draftLiveRoutes.post("/:draftId/simulate", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const rawModelId = req.body?.modelId;
	const modelId = rawModelId === undefined || rawModelId === null ? 1 : Number(rawModelId);
	if (!Number.isInteger(modelId) || modelId < 1) return sendError(res, 400, "Invalid model ID");
	const draftTeamId = Number(req.body?.draftTeamId);
	const playerPk = Number(req.body?.playerPk);
	const bid = Number(req.body?.bid);
	if (!draftTeamId || !playerPk || !Number.isFinite(bid) || bid < 0) {
		return sendError(res, 400, "Invalid payload");
	}
	try {
		const result = await simulatePurchase(db, draftId, modelId, draftTeamId, playerPk, bid);
		return sendSuccess(res, {
			ok: true,
			input: { draftId, modelId, draftTeamId, playerPk, bid },
			player: result.player,
			current: result.current,
			simulated: {
				affordable: result.affordable,
				budgetRemaining: result.simulated.budgetRemaining,
				rosterSpotsRemaining: result.simulated.rosterSpotsRemaining,
				hardMaxBid: result.simulated.hardMaxBid,
			},
			playerValue: result.playerValue ?? null,
			need: result.need,
			scarcity: result.scarcity,
			multiplier: result.multiplier,
			recommendedMaxBid: result.recommendedMaxBid,
		}, "Purchase simulated successfully");
	} catch (e) {
		Logger.error(e, "POST /:draftId/simulate");
		const message = e instanceof Error ? e.message : "Failed to simulate purchase";
		const status = message === "Invalid payload" ? 400
			: message === "Player valuation not found for model" || message === "draft_team_state missing; call /state?recompute=true first" || message === "Draft not found" ? 404
			: 500;
		return sendError(res, status, message);
	}
});

draftLiveRoutes.get("/:draftId/teams/:draftTeamId/needs", async (req: Request, res: Response) => {
	const draftId = parseDraftId(req.params.draftId);
	if (draftId === null) return sendError(res, 400, "Invalid draft ID");
	const draftTeamId = parsePurchaseId(req.params.draftTeamId);
	if (draftTeamId === null) return sendError(res, 400, "Invalid draft team ID");
	const includeRoster = String(req.query.includeRoster ?? "true").toLowerCase() === "true";
	const rawModelId = req.query.modelId;
	const modelId = rawModelId === undefined || rawModelId === null ? null : Number(rawModelId);
	try {
		const needs = await getTeamNeeds(db, draftId, draftTeamId, includeRoster, modelId);
		return sendSuccess(res, {
			ok: true,
			draftId,
			draftTeamId,
			required: needs.required,
			filled: needs.filled,
			remaining: needs.remaining,
			totals: needs.totals,
			teamState: needs.teamState ?? null,
			roster: needs.roster ?? null,
		}, "Team needs fetched successfully");
	} catch (e) {
		Logger.error(e, "GET /:draftId/teams/:draftTeamId/needs");
		const message = e instanceof Error ? e.message : "Failed to get team needs";
		const status = message === "Invalid params" ? 400 : /not found/i.test(message) ? 404 : 500;
		return sendError(res, status, message);
	}
});