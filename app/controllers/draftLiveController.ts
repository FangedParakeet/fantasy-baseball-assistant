import type { QueryableDB } from "../db/db";

const CORE_SLOTS = ["C","1B","2B","3B","SS","OF","UTIL","SP","RP","P"] as const;
const HITTER_SLOTS = ["C","1B","2B","3B","SS","OF","UTIL"] as const;
const PITCHER_SLOTS = ["SP","RP","P"] as const;
/** Order for assigning players to slots: try primary first, then overflow hitters to UTIL→BN, pitchers to P→BN. */
const ASSIGNMENT_SLOT_ORDER = ["C","1B","2B","3B","SS","OF","UTIL","SP","RP","P","BN","IL","NA"] as const;

function clamp(x: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, x));
}

/** Greedy primary slot for need heuristics (pitchers: SP > RP > P; hitters: C > SS > 2B > 3B > 1B > OF > UTIL). */
function primarySlotFromFlags(p: { position?: string; is_c?: number; is_1b?: number; is_2b?: number; is_3b?: number; is_ss?: number; is_of?: number; is_util?: number; is_sp?: number; is_rp?: number }): string {
	if (p.position === "P") {
		if (Number(p.is_sp) === 1) return "SP";
		if (Number(p.is_rp) === 1) return "RP";
		return "P";
	}
	if (Number(p.is_c) === 1) return "C";
	if (Number(p.is_ss) === 1) return "SS";
	if (Number(p.is_2b) === 1) return "2B";
	if (Number(p.is_3b) === 1) return "3B";
	if (Number(p.is_1b) === 1) return "1B";
	if (Number(p.is_of) === 1) return "OF";
	return "UTIL";
}

/** Greedy fill for a team's roster needs using player primary slots; returns remaining required per slot. */
function greedyRemainingNeeds(
	required: Record<string, number>,
	playersPrimarySlots: string[]
): Record<string, number> {
	const remaining: Record<string, number> = { ...required };
	for (const slot of playersPrimarySlots) {
		if ((remaining[slot] ?? 0) > 0) {
			remaining[slot] -= 1;
			continue;
		}
		if (HITTER_SLOTS.includes(slot as (typeof HITTER_SLOTS)[number])) {
			if ((remaining.UTIL ?? 0) > 0) remaining.UTIL -= 1;
		} else {
			if ((remaining.P ?? 0) > 0) remaining.P -= 1;
		}
	}
	for (const k of Object.keys(remaining)) remaining[k] = Math.max(0, remaining[k]);
	return remaining;
}

function slotPredicate(slot: string): string {
	switch (slot) {
		case "C": return "pl.is_c = 1";
		case "1B": return "pl.is_1b = 1";
		case "2B": return "pl.is_2b = 1";
		case "3B": return "pl.is_3b = 1";
		case "SS": return "pl.is_ss = 1";
		case "OF": return "pl.is_of = 1";
		case "UTIL": return "pl.position = 'B'";
		case "SP": return "pl.is_sp = 1";
		case "RP": return "pl.is_rp = 1";
		case "P": return "pl.position = 'P'";
		default: return "1=0";
	}
}

type RosterPlayerInput = {
	player_pk: number;
	name: string;
	position: string;
	primarySlot: string;
	price?: number | null;
	tier?: number | null;
	eligiblePositions?: string | null;
};

type RosterPlayerOutput = {
	playerPk: number;
	name: string;
	position: string;
	primarySlot: string;
	assignedSlot: string;
	price: number | null;
	tier: number | null;
	eligiblePositions: string | null;
};

// Row types for DB queries
interface DraftStateRow {
	draft_id: number;
	league_id: number;
	is_active: number;
	created_at: string;
	budget_total: number;
	team_count: number;
	hitter_budget_pct: number;
	pitcher_budget_pct: number;
}
interface DraftTeamRow {
	draft_team_id: number;
	team_id: number;
	team_name: string;
	yahoo_team_id: string | null;
	is_user_team: number;
	budget_total: number;
}
interface DraftTeamStateRow {
	draft_id: number;
	draft_team_id: number;
	budget_spent: number;
	budget_remaining: number;
	roster_spots_total: number;
	roster_spots_filled: number;
	roster_spots_remaining: number;
	hard_max_bid: number;
	updated_at: string;
}
interface KeeperRow {
	id: number;
	draft_team_id: number;
	player_pk: number;
	player_name: string;
	player_type: string;
	cost: number;
}
interface PurchaseRow {
	id: number;
	sequence_no: number;
	draft_team_id: number;
	player_pk: number;
	player_name: string;
	player_type: string;
	price: number;
	purchased_at: string;
}
interface Last10Row extends PurchaseRow {
	team_id: number;
	team_name: string;
}
interface PositionSupplyRow {
	slot_code: string;
	remaining_above_replacement: number;
	slots_remaining_league: number;
	scarcity_index: number;
	updated_at: string;
}
interface TierSupplyRow {
	slot_code: string;
	tier: number;
	remaining_count: number;
	updated_at: string;
}
interface PositionReplacementRow {
	slot_code: string;
	replacement_value: number;
	replacement_price: number;
	updated_at: string;
}
interface IdRow {
	id: number;
}
interface TakenRow {
	taken: number;
}
interface MaxSeqRow {
	max_seq: number;
}
interface LastPurchaseRow {
	id: number;
	draft_team_id: number;
	player_pk: number;
	price: number;
	sequence_no: number;
}
interface CurPurchaseRow {
	id: number;
	sequence_no: number;
}
interface TeamStateFieldsRow {
	budget_remaining: number;
	roster_spots_remaining: number;
	hard_max_bid?: number;
}
interface LeagueIdRow {
	league_id: number;
}
interface SlotRow {
	slot_code: string;
	slot_count: number;
}
interface PlayerValueRow {
	position: string;
	is_c: number;
	is_1b: number;
	is_2b: number;
	is_3b: number;
	is_ss: number;
	is_of: number;
	is_util: number;
	is_sp: number;
	is_rp: number;
	total_value: number;
	est_auction_value: number;
	est_max_auction_value: number;
	tier: number;
	risk_score: number;
	reliability_score: number;
}
interface ScarRow {
	scarcity_index: number;
}
interface SpotsRow {
	roster_spots_total: number;
}
interface DraftTeamBudgetRow {
	draft_team_id: number;
	budget_total: number;
}
interface KeeperAggRow {
	draft_team_id: number;
	keeper_spent: number;
	keeper_count: number;
}
interface PurchaseAggRow {
	draft_team_id: number;
	purchase_spent: number;
	purchase_count: number;
}
interface DraftLeagueTeamRow {
	league_id: number;
	team_count: number;
}
interface SupplyPricedRow {
	priced_remaining: number;
}
interface TierRemainingRow {
	tier: number;
	remaining_count: number;
}
interface TierRow {
	player_pk: number;
	tier: number;
}
interface PriceRow {
	player_pk: number;
	price: number;
}
interface OwnedRosterRow {
	player_pk: number;
	name: string;
	position: string;
	eligible_positions: string | null;
	is_c: number;
	is_1b: number;
	is_2b: number;
	is_3b: number;
	is_ss: number;
	is_of: number;
	is_util: number;
	is_sp: number;
	is_rp: number;
}
interface OwnedPositionRow {
	position: string;
	is_c: number;
	is_1b: number;
	is_2b: number;
	is_3b: number;
	is_ss: number;
	is_of: number;
	is_util: number;
	is_sp: number;
	is_rp: number;
}

/** Assign each player to a roster slot: primary first, then hitters→UTIL→BN, pitchers→P→BN. Returns filled/remaining and roster with assignedSlot. */
function assignRosterToSlots(
	requiredAll: Record<string, number>,
	players: RosterPlayerInput[]
): {
	filled: Record<string, number>;
	remaining: Record<string, number>;
	roster: RosterPlayerOutput[];
} {
	const remaining: Record<string, number> = {};
	for (const slot of ASSIGNMENT_SLOT_ORDER) {
		const c = requiredAll[slot];
		if (c != null && c > 0) remaining[slot] = c;
	}
	const filled: Record<string, number> = {};
	for (const k of Object.keys(remaining)) filled[k] = 0;

	const orderIndex = (slot: string) => {
		const i = ASSIGNMENT_SLOT_ORDER.indexOf(slot as typeof ASSIGNMENT_SLOT_ORDER[number]);
		return i >= 0 ? i : 999;
	};
	const sortedPlayers = [...players].sort((a, b) => orderIndex(a.primarySlot) - orderIndex(b.primarySlot));

	const roster: RosterPlayerOutput[] = [];

	for (const p of sortedPlayers) {
		const primary = p.primarySlot;
		let assigned: string | null = null;
		if ((remaining[primary] ?? 0) > 0) {
			assigned = primary;
		} else if (HITTER_SLOTS.includes(primary as typeof HITTER_SLOTS[number])) {
			if ((remaining["UTIL"] ?? 0) > 0) assigned = "UTIL";
			else if ((remaining["BN"] ?? 0) > 0) assigned = "BN";
		} else {
			if ((remaining["P"] ?? 0) > 0) assigned = "P";
			else if ((remaining["BN"] ?? 0) > 0) assigned = "BN";
		}
		if (assigned) {
			remaining[assigned] = (remaining[assigned] ?? 0) - 1;
			filled[assigned] = (filled[assigned] ?? 0) + 1;
			roster.push({
				playerPk: p.player_pk,
				name: p.name,
				position: p.position,
				primarySlot: p.primarySlot,
				assignedSlot: assigned,
				price: p.price != null ? Number(p.price) : null,
				tier: p.tier != null ? Number(p.tier) : null,
				eligiblePositions: p.eligiblePositions ?? null,
			});
		}
	}

	for (const k of Object.keys(remaining)) remaining[k] = Math.max(0, remaining[k]);
	return { filled, remaining, roster };
}

export interface GetStateResult {
	draftId: number;
	leagueId: number;
	isActive: number;
	createdAt: string;
	budgetTotal: number;
	teamCount: number;
	hitterBudgetPct: number;
	pitcherBudgetPct: number;
	draftTeams: DraftTeamRow[];
	teamStates: DraftTeamStateRow[];
	keepers: KeeperRow[];
	purchases: PurchaseRow[];
	last10: Last10Row[];
	positionSupply: PositionSupplyRow[];
	tierSupply: TierSupplyRow[];
	positionReplacement: PositionReplacementRow[];
}

export async function getState(conn: QueryableDB, draftId: number, modelId: number): Promise<GetStateResult> {
	if (!draftId) throw new Error("Invalid draftId");
	if (!Number.isInteger(modelId) || modelId < 1) throw new Error("Invalid modelId");

	// Draft + league settings
	const [[draftRow]] = await conn.query<DraftStateRow[]>(
		`
		SELECT
			d.id AS draft_id,
			d.league_id,
			d.is_active,
			d.created_at,
			ls.budget_total,
			ls.team_count,
			ls.hitter_budget_pct,
			ls.pitcher_budget_pct
		FROM drafts d
		JOIN league_settings ls ON ls.league_id = d.league_id
		WHERE d.id = ?
		LIMIT 1
		`,
		[draftId]
	);
	if (!draftRow) throw new Error("Draft not found");

	const leagueId = Number(draftRow.league_id);

	// Draft teams + linked Yahoo teams
	const [draftTeams] = await conn.query<DraftTeamRow[]>(
		`
		SELECT
			dt.id AS draft_team_id,
			dt.team_id,
			t.team_name,
			t.yahoo_team_id,
			t.is_user_team,
			dt.budget_total
		FROM draft_teams dt
		JOIN teams t ON t.id = dt.team_id
		WHERE dt.draft_id = ?
		ORDER BY t.is_user_team DESC, t.team_name ASC
		`,
		[draftId]
	);

	// Team state (cached)
	const [teamStates] = await conn.query<DraftTeamStateRow[]>(
		`
		SELECT *
		FROM draft_team_state
		WHERE draft_id = ?
		`,
		[draftId]
	);

	// Keepers (with player names for display)
	const [keepers] = await conn.query<KeeperRow[]>(
		`
		SELECT
			dk.id,
			dk.draft_team_id,
			dk.player_pk,
			p.name AS player_name,
			p.position AS player_type,
			dk.cost
		FROM draft_keepers dk
		JOIN players p ON p.id = dk.player_pk
		WHERE dk.draft_id = ?
		ORDER BY dk.draft_team_id ASC, p.name ASC
		`,
		[draftId]
	);

	// Purchases (ordered)
	const [purchases] = await conn.query<PurchaseRow[]>(
		`
		SELECT
			dp.id,
			dp.sequence_no,
			dp.draft_team_id,
			dp.player_pk,
			p.name AS player_name,
			p.position AS player_type,
			dp.price,
			dp.purchased_at
		FROM draft_purchases dp
		JOIN players p ON p.id = dp.player_pk
		WHERE dp.draft_id = ?
		ORDER BY dp.sequence_no ASC
		`,
		[draftId]
	);

	// Last 10 picks
	const [last10] = await conn.query<Last10Row[]>(
		`
		SELECT
			dp.id,
			dp.sequence_no,
			dp.price,
			dp.purchased_at,
			dp.draft_team_id,
			dt.team_id,
			t.team_name,
			dp.player_pk,
			pl.name AS player_name
		FROM draft_purchases dp
		JOIN draft_teams dt ON dt.id = dp.draft_team_id
		JOIN teams t ON t.id = dt.team_id
		JOIN players pl ON pl.id = dp.player_pk
		WHERE dp.draft_id = ?
		ORDER BY dp.sequence_no DESC
		LIMIT 10
		`,
		[draftId]
	);

	// Supply (cached for this draft/model)
	const [positionSupply] = await conn.query<PositionSupplyRow[]>(
		`
		SELECT slot_code, remaining_above_replacement, slots_remaining_league, scarcity_index, updated_at
		FROM draft_position_supply
		WHERE draft_id = ? AND model_id = ?
		ORDER BY slot_code ASC
		`,
		[draftId, modelId]
	);

	const [tierSupply] = await conn.query<TierSupplyRow[]>(
		`
		SELECT slot_code, tier, remaining_count, updated_at
		FROM draft_tier_supply
		WHERE draft_id = ? AND model_id = ?
		ORDER BY slot_code ASC, tier ASC
		`,
		[draftId, modelId]
	);

	// Replacement (optional UI panel)
	const [positionReplacement] = await conn.query<PositionReplacementRow[]>(
		`
		SELECT slot_code, replacement_value, replacement_price, updated_at
		FROM draft_position_replacement
		WHERE draft_id = ? AND model_id = ?
		ORDER BY slot_code ASC
		`,
		[draftId, modelId]
	);

	return {
		draftId,
		leagueId,
		isActive: draftRow.is_active,
		createdAt: draftRow.created_at,
		budgetTotal: draftRow.budget_total,
		teamCount: draftRow.team_count,
		hitterBudgetPct: draftRow.hitter_budget_pct,
		pitcherBudgetPct: draftRow.pitcher_budget_pct,
		draftTeams,
		teamStates,
		keepers,
		purchases,
		last10,
		positionSupply,
		tierSupply,
		positionReplacement,
	};
}

export async function makePurchase(
	conn: QueryableDB,
	draftId: number,
	draftTeamId: number,
	modelId: number | string | undefined,
	playerPk: number,
	price: number
): Promise<{ teamState: DraftTeamStateRow | undefined; last10: Last10Row[]; nextSeq: number }> {
	const ppk = Number(playerPk);
	const dtid = Number(draftTeamId);
	const pr = Number(price);
	const mid = Number(modelId ?? 1);

	if (!draftId || !ppk || !dtid || !Number.isFinite(pr) || pr < 0) {
		throw new Error("Invalid payload");
	}

	// Ensure draft_team belongs to this draft
	const [[teamRow]] = await conn.query<IdRow[]>(
		`SELECT id FROM draft_teams WHERE id = ? AND draft_id = ? LIMIT 1`,
		[dtid, draftId]
	);
	if (!teamRow) {
		throw new Error("draftTeamId not in this draft");
	}

	// Prevent buying a keeper or already purchased player
	const [[takenRow]] = await conn.query<TakenRow[]>(
		`
		SELECT 1 AS taken
		FROM (
			SELECT player_pk FROM draft_keepers WHERE draft_id = ? AND player_pk = ?
			UNION ALL
			SELECT player_pk FROM draft_purchases WHERE draft_id = ? AND player_pk = ?
		) t
		LIMIT 1
		`,
		[draftId, ppk, draftId, ppk]
	);

	if (takenRow) {
		throw new Error("Player already taken (keeper/purchased)");
	}

	// sequence_no = max+1
	const [[seqRow]] = await conn.query<MaxSeqRow[]>(
		`SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM draft_purchases WHERE draft_id = ?`,
		[draftId]
	);
	const nextSeq = Number(seqRow.max_seq ?? 0) + 1;

	// Insert purchase
	await conn.query(
		`
		INSERT INTO draft_purchases
			(draft_id, draft_team_id, player_pk, price, sequence_no, purchased_at)
		VALUES (?, ?, ?, ?, ?, NOW())
		`,
		[draftId, dtid, ppk, pr, nextSeq]
	);

	// Recompute team state (budgets, hard max bid)
	await recomputeDraftTeamState(conn, draftId);

	// Recompute draft-specific supply/tier supply (optional but recommended)
	await recomputeDraftSupply(conn, draftId, mid);

	// Last 10 picks
	const [last10] = await conn.query<Last10Row[]>(
		`
		SELECT
			dp.id,
			dp.sequence_no,
			dp.price,
			dp.purchased_at,
			dp.draft_team_id,
			dt.team_id,
			t.team_name,
			dp.player_pk,
			pl.name AS player_name
		FROM draft_purchases dp
		JOIN draft_teams dt ON dt.id = dp.draft_team_id
		JOIN teams t ON t.id = dt.team_id
		JOIN players pl ON pl.id = dp.player_pk
		WHERE dp.draft_id = ?
		ORDER BY dp.sequence_no DESC
		LIMIT 10
		`,
		[draftId]
	);

	// Return updated state for this team
	const [[teamState]] = await conn.query<DraftTeamStateRow[]>(
		`SELECT * FROM draft_team_state WHERE draft_id = ? AND draft_team_id = ?`,
		[draftId, dtid]
	);

	return {
		teamState,
		last10,
		nextSeq,
	};
}


export async function undoPurchase(
    conn: QueryableDB,
    draftId: number,
    modelId: number
): Promise<{ lastPurchase: LastPurchaseRow; teamState: DraftTeamStateRow | undefined; last10: Last10Row[] }> {
    if (!draftId) throw new Error("Invalid draftId");

      // Find last purchase by sequence_no
      const [[last]] = await conn.query<LastPurchaseRow[]>(
        `
        SELECT id, draft_team_id, player_pk, price, sequence_no
        FROM draft_purchases
        WHERE draft_id = ?
        ORDER BY sequence_no DESC
        LIMIT 1
        `,
        [draftId]
      );

      if (!last) {
        throw new Error("No purchases to undo");
      }

      // Delete it
      await conn.query(`DELETE FROM draft_purchases WHERE id = ? AND draft_id = ?`, [
        Number(last.id),
        draftId,
      ]);

      // Recompute budgets / max bids
      await recomputeDraftTeamState(conn, draftId);

      // Recompute supply/tier supply (taken set changed)
      await recomputeDraftSupply(conn, draftId, modelId);

      // Fetch updated last 10
      const [last10] = await conn.query<Last10Row[]>(
        `
        SELECT
          dp.id,
          dp.sequence_no,
          dp.price,
          dp.purchased_at,
          dp.draft_team_id,
          dt.team_id,
          t.team_name,
          dp.player_pk,
          pl.name AS player_name
        FROM draft_purchases dp
        JOIN draft_teams dt ON dt.id = dp.draft_team_id
        JOIN teams t ON t.id = dt.team_id
        JOIN players pl ON pl.id = dp.player_pk
        WHERE dp.draft_id = ?
        ORDER BY dp.sequence_no DESC
        LIMIT 10
        `,
        [draftId]
      );

      // Return updated state for the team that was affected
      const [[teamState]] = await conn.query<DraftTeamStateRow[]>(
        `SELECT * FROM draft_team_state WHERE draft_id = ? AND draft_team_id = ?`,
        [draftId, Number(last.draft_team_id)]
      );

      return {
        lastPurchase: last,
        teamState,
        last10,
      };
}

export async function movePurchase(

    conn: QueryableDB,
    draftId: number,
    purchaseId: number,
    direction: "up" | "down"
): Promise<{ swappedPurchaseId: number; last10: Last10Row[] }> {
      // Load current purchase
      const [[cur]] = await conn.query<CurPurchaseRow[]>(
        `
        SELECT id, sequence_no
        FROM draft_purchases
        WHERE id = ? AND draft_id = ?
        LIMIT 1
        `,
        [purchaseId, draftId]
      );

      if (!cur) {
        throw new Error("Purchase not found");
      }

      const curSeq = Number(cur.sequence_no);

      // Find neighbour
      const neighbourSql =
        direction === "up"
          ? `
            SELECT id, sequence_no
            FROM draft_purchases
            WHERE draft_id = ? AND sequence_no < ?
            ORDER BY sequence_no DESC
            LIMIT 1
          `
          : `
            SELECT id, sequence_no
            FROM draft_purchases
            WHERE draft_id = ? AND sequence_no > ?
            ORDER BY sequence_no ASC
            LIMIT 1
          `;

      const [[nbr]] = await conn.query<CurPurchaseRow[]>(neighbourSql, [draftId, curSeq]);

      if (!nbr) {
        throw new Error("Already at boundary");
      }

      const nbrId = Number(nbr.id);
      const nbrSeq = Number(nbr.sequence_no);

      // Swap sequence numbers
      // Use a temporary value to avoid UNIQUE constraint conflicts
      const tempSeq = -999999;

      await conn.query(
        `UPDATE draft_purchases SET sequence_no = ? WHERE id = ? AND draft_id = ?`,
        [tempSeq, purchaseId, draftId]
      );
      await conn.query(
        `UPDATE draft_purchases SET sequence_no = ? WHERE id = ? AND draft_id = ?`,
        [curSeq, nbrId, draftId]
      );
      await conn.query(
        `UPDATE draft_purchases SET sequence_no = ? WHERE id = ? AND draft_id = ?`,
        [nbrSeq, purchaseId, draftId]
      );

      // Return updated last 10 (ordering changed)
      const [last10] = await conn.query<Last10Row[]>(
        `
        SELECT
          dp.id,
          dp.sequence_no,
          dp.price,
          dp.purchased_at,
          dp.draft_team_id,
          dt.team_id,
          t.team_name,
          dp.player_pk,
          pl.name AS player_name
        FROM draft_purchases dp
        JOIN draft_teams dt ON dt.id = dp.draft_team_id
        JOIN teams t ON t.id = dt.team_id
        JOIN players pl ON pl.id = dp.player_pk
        WHERE dp.draft_id = ?
        ORDER BY dp.sequence_no DESC
        LIMIT 10
        `,
        [draftId]
      );

      return {
        swappedPurchaseId: Number(nbr.id),
        last10,
      };
}

export type SimulatePurchaseResult = {
	affordable: boolean;
	current: { budgetRemaining: number; rosterSpotsRemaining: number; hardMaxBid: number };
	simulated: { budgetRemaining: number; rosterSpotsRemaining: number; hardMaxBid: number };
	player: {
		primarySlot: string;
		estAuctionValue: number;
		estMaxAuctionValue: number;
		tier: number;
		reliabilityScore: number;
		riskScore: number;
	};
	playerValue: PlayerValueRow | null;
	need: {
		required: Record<string, number>;
		remainingNeeds: Record<string, number>;
		primarySlotNeed: number;
		primarySlotTotal: number;
		needRatio: number;
	};
	scarcity: { scarcityIndex: number };
	multiplier: { needBoost: number; scarcityBoost: number; total: number };
	recommendedMaxBid: number;
};

export async function simulatePurchase(
	conn: QueryableDB,
	draftId: number,
	modelId: number,
	draftTeamId: number,
	playerPk: number,
	bid: number
): Promise<SimulatePurchaseResult> {
	if (!draftId || !modelId || !draftTeamId || !playerPk || !Number.isFinite(bid) || bid < 0) {
		throw new Error("Invalid payload");
	}

	// 1) Load current team state (cached)
	const [[state]] = await conn.query<TeamStateFieldsRow[]>(
		`SELECT budget_remaining, roster_spots_remaining
		 FROM draft_team_state
		 WHERE draft_id = ? AND draft_team_id = ?
		 LIMIT 1`,
		[draftId, draftTeamId]
	);
	if (!state) {
		throw new Error("draft_team_state missing; call /state?recompute=true first");
	}

	const budgetRemaining = Number(state.budget_remaining);
	const rosterRemaining = Number(state.roster_spots_remaining);
	const hardMaxBid = Math.max(0, budgetRemaining - Math.max(0, rosterRemaining - 1));
	const affordable = bid <= hardMaxBid;
	const newBudgetRemaining = Math.max(0, budgetRemaining - bid);
	const newRosterRemaining = Math.max(0, rosterRemaining - 1);
	const newHardMaxBid = Math.max(0, newBudgetRemaining - Math.max(0, newRosterRemaining - 1));

	// 2) Nominated player: position flags + valuation
	const [[playerRow]] = await conn.query<PlayerValueRow[]>(
		`
		SELECT
			pl.position,
			pl.is_c, pl.is_1b, pl.is_2b, pl.is_3b, pl.is_ss, pl.is_of, pl.is_util, pl.is_sp, pl.is_rp,
			v.total_value, v.est_auction_value, v.est_max_auction_value, v.tier, v.risk_score, v.reliability_score
		FROM players pl
		JOIN draft_player_values v ON v.player_pk = pl.id AND v.model_id = ?
		WHERE pl.id = ?
		LIMIT 1
		`,
		[modelId, playerPk]
	);
	if (!playerRow) {
		throw new Error("Player valuation not found for model");
	}
	const primarySlot = primarySlotFromFlags(playerRow);
	const baseMax = Number(playerRow.est_max_auction_value ?? 0);

	// 3) Required slots per team (core slots only)
	const [[draftRow]] = await conn.query<LeagueIdRow[]>(
		`SELECT league_id FROM drafts WHERE id = ? LIMIT 1`,
		[draftId]
	);
	if (!draftRow) throw new Error("Draft not found");
	const leagueId = Number(draftRow.league_id);
	const [slotRows] = await conn.query<SlotRow[]>(
		`SELECT slot_code, slot_count
		 FROM league_roster_slots
		 WHERE league_id = ? AND counts_toward_remaining_roster = TRUE`,
		[leagueId]
	);
	const required: Record<string, number> = {};
	for (const r of slotRows) {
		const code = String(r.slot_code).toUpperCase();
		if (!([...HITTER_SLOTS, ...PITCHER_SLOTS] as string[]).includes(code)) continue;
		required[code] = Number(r.slot_count);
	}

	// 4) Current roster (keepers + purchases) for this team
	const [owned] = await conn.query<OwnedPositionRow[]>(
		`
		SELECT
			pl.position,
			pl.is_c, pl.is_1b, pl.is_2b, pl.is_3b, pl.is_ss, pl.is_of, pl.is_util, pl.is_sp, pl.is_rp
		FROM (
			SELECT player_pk FROM draft_keepers WHERE draft_id = ? AND draft_team_id = ?
			UNION ALL
			SELECT player_pk FROM draft_purchases WHERE draft_id = ? AND draft_team_id = ?
		) x
		JOIN players pl ON pl.id = x.player_pk
		`,
		[draftId, draftTeamId, draftId, draftTeamId]
	);
	const ownedPrimarySlots = owned.map(primarySlotFromFlags);
	const remainingNeeds = greedyRemainingNeeds(required, ownedPrimarySlots);
	const needForSlot = Number(remainingNeeds[primarySlot] ?? 0);
	const totalForSlot = Number(required[primarySlot] ?? 0);
	const needRatio = totalForSlot > 0 ? needForSlot / totalForSlot : 0;

	// 5) Scarcity from draft_position_supply
	const [[scarRow]] = await conn.query<ScarRow[]>(
		`SELECT scarcity_index
		 FROM draft_position_supply
		 WHERE draft_id = ? AND model_id = ? AND slot_code = ?
		 LIMIT 1`,
		[draftId, modelId, primarySlot]
	);
	const scarcityIndex = scarRow ? Number(scarRow.scarcity_index) : 2.0;

	// 6) Position need + scarcity multipliers
	const needStrength = 0.35;
	const scarcityStrength = 0.4;
	const needBoost = 1 + needRatio * needStrength;
	const scarcityNorm = clamp((1.5 - scarcityIndex) / 1.5, 0, 1);
	const scarcityBoost = 1 + scarcityNorm * scarcityStrength;
	const multiplier = clamp(needBoost * scarcityBoost, 0.85, 1.6);
	const recommendedMaxBid = Math.min(newHardMaxBid, Math.round(baseMax * multiplier * 100) / 100);

	return {
		affordable,
		current: {
			budgetRemaining,
			rosterSpotsRemaining: rosterRemaining,
			hardMaxBid,
		},
		simulated: {
			budgetRemaining: newBudgetRemaining,
			rosterSpotsRemaining: newRosterRemaining,
			hardMaxBid: newHardMaxBid,
		},
		player: {
			primarySlot,
			estAuctionValue: Number(playerRow.est_auction_value),
			estMaxAuctionValue: baseMax,
			tier: Number(playerRow.tier),
			reliabilityScore: Number(playerRow.reliability_score),
			riskScore: Number(playerRow.risk_score),
		},
		playerValue: playerRow,
		need: {
			required,
			remainingNeeds,
			primarySlotNeed: needForSlot,
			primarySlotTotal: totalForSlot,
			needRatio,
		},
		scarcity: { scarcityIndex },
		multiplier: { needBoost, scarcityBoost, total: multiplier },
		recommendedMaxBid,
	};
}

export async function recomputeDraftTeamState(
	conn: QueryableDB,
	draftId: number
): Promise<void> {
	// 1) league_id
	const [[draftRow]] = await conn.query<LeagueIdRow[]>(
		`SELECT league_id FROM drafts WHERE id = ?`,
		[draftId]
	);
	if (!draftRow) throw new Error(`Draft ${draftId} not found`);
	const leagueId = Number(draftRow.league_id);

	// 2) roster spots total (per team)
	const [[spotsRow]] = await conn.query<SpotsRow[]>(
		`SELECT COALESCE(SUM(slot_count),0) AS roster_spots_total
		 FROM league_roster_slots
		 WHERE league_id = ?
		   AND counts_toward_remaining_roster = TRUE`,
		[leagueId]
	);
	const rosterSpotsTotal = Number(spotsRow.roster_spots_total ?? 0);

	// 3) draft teams
	const [teams] = await conn.query<DraftTeamBudgetRow[]>(
		`SELECT id AS draft_team_id, budget_total
		 FROM draft_teams
		 WHERE draft_id = ?`,
		[draftId]
	);

	// 4) keeper agg
	const [keeperAgg] = await conn.query<KeeperAggRow[]>(
		`SELECT draft_team_id,
		        COALESCE(SUM(cost),0) AS keeper_spent,
		        COUNT(*) AS keeper_count
		 FROM draft_keepers
		 WHERE draft_id = ?
		 GROUP BY draft_team_id`,
		[draftId]
	);

	// 5) purchase agg
	const [purchaseAgg] = await conn.query<PurchaseAggRow[]>(
		`SELECT draft_team_id,
		        COALESCE(SUM(price),0) AS purchase_spent,
		        COUNT(*) AS purchase_count
		 FROM draft_purchases
		 WHERE draft_id = ?
		 GROUP BY draft_team_id`,
		[draftId]
	);

	const keeperMap = new Map<number, { spent: number; count: number }>();
	for (const r of keeperAgg) {
		keeperMap.set(Number(r.draft_team_id), {
			spent: Number(r.keeper_spent),
			count: Number(r.keeper_count),
		});
	}

	const purchaseMap = new Map<number, { spent: number; count: number }>();
	for (const r of purchaseAgg) {
		purchaseMap.set(Number(r.draft_team_id), {
			spent: Number(r.purchase_spent),
			count: Number(r.purchase_count),
		});
	}

	const upsertSql = `
		INSERT INTO draft_team_state
		  (draft_id, draft_team_id,
		   budget_spent, budget_remaining,
		   roster_spots_total, roster_spots_filled, roster_spots_remaining,
		   hard_max_bid, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
		ON DUPLICATE KEY UPDATE
		  budget_spent = VALUES(budget_spent),
		  budget_remaining = VALUES(budget_remaining),
		  roster_spots_total = VALUES(roster_spots_total),
		  roster_spots_filled = VALUES(roster_spots_filled),
		  roster_spots_remaining = VALUES(roster_spots_remaining),
		  hard_max_bid = VALUES(hard_max_bid),
		  updated_at = NOW()
	`;

	for (const t of teams) {
		const draftTeamId = Number(t.draft_team_id);
		const budgetTotal = Number(t.budget_total);

		const k = keeperMap.get(draftTeamId) ?? { spent: 0, count: 0 };
		const p = purchaseMap.get(draftTeamId) ?? { spent: 0, count: 0 };

		const budgetSpent = k.spent + p.spent;
		const budgetRemaining = Math.max(0, budgetTotal - budgetSpent);

		const filled = k.count + p.count;
		const remaining = Math.max(0, rosterSpotsTotal - filled);

		// hard max bid = remaining budget minus $1 for each other remaining slot
		const hardMaxBid = Math.max(0, budgetRemaining - Math.max(0, remaining - 1));

		await conn.query(upsertSql, [
			draftId,
			draftTeamId,
			budgetSpent,
			budgetRemaining,
			rosterSpotsTotal,
			filled,
			remaining,
			hardMaxBid,
		]);
	}
}

export async function recomputeDraftSupply(
	conn: QueryableDB,
	draftId: number,
	modelId: number
): Promise<void> {
	// Get league_id + team_count
	const [[draftRow]] = await conn.query<DraftLeagueTeamRow[]>(
		`SELECT d.league_id, ls.team_count
		 FROM drafts d
		 JOIN league_settings ls ON ls.league_id = d.league_id
		 WHERE d.id = ?`,
		[draftId]
	);
	if (!draftRow) throw new Error(`Draft ${draftId} not found`);
	const leagueId = Number(draftRow.league_id);
	const teamCount = Number(draftRow.team_count);

	// Demand per slot_code (league-wide)
	const [slotRows] = await conn.query<SlotRow[]>(
		`SELECT slot_code, slot_count
		 FROM league_roster_slots
		 WHERE league_id = ?
		   AND counts_toward_remaining_roster = TRUE`,
		[leagueId]
	);

	const demand = new Map<string, number>();
	for (const r of slotRows) {
		const code = String(r.slot_code).toUpperCase();
		demand.set(code, (demand.get(code) ?? 0) + Number(r.slot_count) * teamCount);
	}

	// Clear existing tier supply for draft/model (prevents stale tiers)
	await conn.query(`DELETE FROM draft_tier_supply WHERE draft_id = ? AND model_id = ?`, [draftId, modelId]);

	// Upsert helpers
	const upsertSupplySql = `
		INSERT INTO draft_position_supply
			(draft_id, model_id, slot_code, remaining_above_replacement, slots_remaining_league, scarcity_index, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, NOW())
		ON DUPLICATE KEY UPDATE
			remaining_above_replacement = VALUES(remaining_above_replacement),
			slots_remaining_league = VALUES(slots_remaining_league),
			scarcity_index = VALUES(scarcity_index),
			updated_at = NOW()
	`;
	const upsertTierSql = `
		INSERT INTO draft_tier_supply
			(draft_id, model_id, slot_code, tier, remaining_count, updated_at)
		VALUES (?, ?, ?, ?, ?, NOW())
		ON DUPLICATE KEY UPDATE
			remaining_count = VALUES(remaining_count),
			updated_at = NOW()
	`;

	for (const slot of CORE_SLOTS) {
		const slotsRemaining = demand.get(slot) ?? 0;
		if (slotsRemaining <= 0) continue;

		// Supply = priced eligible and NOT taken (keepers+purchases)
		const [[supplyRow]] = await conn.query<SupplyPricedRow[]>(
			`
			SELECT
				COUNT(*) AS priced_remaining
			FROM draft_player_values v
			JOIN players pl ON pl.id = v.player_pk
			LEFT JOIN (
				SELECT DISTINCT player_pk FROM (
					SELECT player_pk FROM draft_keepers WHERE draft_id = ?
					UNION ALL
					SELECT player_pk FROM draft_purchases WHERE draft_id = ?
				) x
			) taken ON taken.player_pk = v.player_pk
			WHERE v.model_id = ?
			  AND taken.player_pk IS NULL
			  AND v.est_auction_value > 0
			  AND ${slotPredicate(slot)}
			`,
			[draftId, draftId, modelId]
		);
		const pricedRemaining = Number(supplyRow.priced_remaining ?? 0);
		const scarcityIndex = pricedRemaining / slotsRemaining;

		await conn.query(upsertSupplySql, [
			draftId,
			modelId,
			slot,
			pricedRemaining,
			slotsRemaining,
			scarcityIndex,
		]);

		// Tier supply for this slot (counts remaining by tier)
		const [tierRows] = await conn.query<TierRemainingRow[]>(
			`
			SELECT v.tier, COUNT(*) AS remaining_count
			FROM draft_player_values v
			JOIN players pl ON pl.id = v.player_pk
			LEFT JOIN (
				SELECT DISTINCT player_pk FROM (
					SELECT player_pk FROM draft_keepers WHERE draft_id = ?
					UNION ALL
					SELECT player_pk FROM draft_purchases WHERE draft_id = ?
				) x
			) taken ON taken.player_pk = v.player_pk
			WHERE v.model_id = ?
			  AND taken.player_pk IS NULL
			  AND ${slotPredicate(slot)}
			  AND v.tier IS NOT NULL
			GROUP BY v.tier
			ORDER BY v.tier ASC
			`,
			[draftId, draftId, modelId]
		);

		for (const tr of tierRows) {
			await conn.query(upsertTierSql, [
				draftId,
				modelId,
				slot,
				Number(tr.tier),
				Number(tr.remaining_count),
			]);
		}
	}
}

export async function getTeamNeeds(
	conn: QueryableDB,
	draftId: number,
	draftTeamId: number,
	includeRoster: boolean = true,
	modelId?: number | null
): Promise<{
	required: Record<string, number>;
	filled: Record<string, number>;
	remaining: Record<string, number>;
	totals: { required: number; filled: number; remaining: number };
	teamState: { budgetRemaining: number; rosterSpotsRemaining: number; hardMaxBid: number } | null;
	roster: { playerPk: number; name: string; position: string; primarySlot: string; assignedSlot: string; price: number | null; tier: number | null; eligiblePositions: string | null }[] | null;
}> {
	if (!draftId || !draftTeamId) {
		throw new Error("Invalid params");
	}

	const [[draftRow]] = await conn.query<LeagueIdRow[]>(
		`SELECT league_id FROM drafts WHERE id = ? LIMIT 1`,
		[draftId]
	);
	if (!draftRow) throw new Error(`Draft ${draftId} not found`);
	const leagueId = Number(draftRow.league_id);

	const [slotRows] = await conn.query<SlotRow[]>(
		`SELECT slot_code, slot_count
		 FROM league_roster_slots
		 WHERE league_id = ?
		 ORDER BY FIELD(slot_code, 'C','1B','2B','3B','SS','OF','UTIL','SP','RP','P','BN','IL','NA'), sort_order`,
		[leagueId]
	);
	const requiredAll: Record<string, number> = {};
	for (const r of slotRows) {
		const code = String(r.slot_code).toUpperCase();
		requiredAll[code] = Number(r.slot_count);
	}

	const [priceRows] = await conn.query<PriceRow[]>(
		`SELECT player_pk, cost AS price FROM draft_keepers WHERE draft_id = ? AND draft_team_id = ?
		 UNION ALL
		 SELECT player_pk, price FROM draft_purchases WHERE draft_id = ? AND draft_team_id = ?`,
		[draftId, draftTeamId, draftId, draftTeamId]
	);
	const priceByPlayer = new Map<number, number>();
	for (const row of priceRows) {
		priceByPlayer.set(Number(row.player_pk), Number(row.price));
	}

	const [owned] = await conn.query<OwnedRosterRow[]>(
		`
		SELECT
			pl.id AS player_pk,
			pl.name,
			pl.position,
			pl.eligible_positions,
			pl.is_c, pl.is_1b, pl.is_2b, pl.is_3b, pl.is_ss, pl.is_of, pl.is_util,
			pl.is_sp, pl.is_rp
		FROM (
			SELECT player_pk FROM draft_keepers WHERE draft_id = ? AND draft_team_id = ?
			UNION ALL
			SELECT player_pk FROM draft_purchases WHERE draft_id = ? AND draft_team_id = ?
		) x
		JOIN players pl ON pl.id = x.player_pk
		`,
		[draftId, draftTeamId, draftId, draftTeamId]
	);

	const tierByPlayer = new Map<number, number>();
	if (modelId != null && Number.isInteger(modelId) && modelId >= 1) {
		const playerPks = owned.map((p: OwnedRosterRow) => Number(p.player_pk));
		if (playerPks.length > 0) {
			const placeholders = playerPks.map(() => "?").join(",");
			const [tierRows] = await conn.query<TierRow[]>(
				`SELECT player_pk, tier FROM draft_player_values WHERE model_id = ? AND player_pk IN (${placeholders})`,
				[modelId, ...playerPks]
			);
			for (const row of tierRows) {
				tierByPlayer.set(Number(row.player_pk), Number(row.tier));
			}
		}
	}

	const playersWithSlot: RosterPlayerInput[] = owned.map((p: OwnedRosterRow) => ({
		player_pk: Number(p.player_pk),
		name: p.name,
		position: p.position,
		primarySlot: primarySlotFromFlags(p),
		price: priceByPlayer.get(Number(p.player_pk)) ?? null,
		tier: tierByPlayer.get(Number(p.player_pk)) ?? null,
		eligiblePositions: p.eligible_positions ?? null,
	}));
	const { filled, remaining, roster: assignedRoster } = assignRosterToSlots(requiredAll, playersWithSlot);

	const [[teamState]] = await conn.query<TeamStateFieldsRow[]>(
		`SELECT budget_remaining, roster_spots_remaining, hard_max_bid
		 FROM draft_team_state
		 WHERE draft_id = ? AND draft_team_id = ?
		 LIMIT 1`,
		[draftId, draftTeamId]
	);
	const teamStateObj = teamState ? {
		budgetRemaining: Number(teamState.budget_remaining),
		rosterSpotsRemaining: Number(teamState.roster_spots_remaining),
		hardMaxBid: Number(teamState.hard_max_bid),
	} : null;

	return {
		required: requiredAll,
		filled,
		remaining,
		totals: {
			required: Object.values(requiredAll).reduce((a, b) => a + b, 0),
			filled: Object.values(filled).reduce((a, b) => a + b, 0),
			remaining: Object.values(remaining).reduce((a, b) => a + b, 0),
		},
		teamState: teamStateObj,
		roster: includeRoster ? assignedRoster : null,
	};
}