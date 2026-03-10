import { QueryableDB } from "../db/db";
import { slotWhereClause } from "../utils/functions";
import type { Position } from "../classes/league";

export type BoardQuery = {
	modelId?: string;
	pos?: Position;
	group?: "hitter" | "pitcher" | "all";
	tierMin?: string;
	tierMax?: string;
	priceMin?: string;
	priceMax?: string;
	q?: string;
	sort?: string; // "value" | "price"
	dir?: string;  // "asc" | "desc"
	limit?: string;
	offset?: string;
};


export async function getBoard(conn: QueryableDB, draftId: number, query: BoardQuery): Promise<{ total: number; rows: any[] }> {
	const {
		modelId = "1",
		pos,
		group,
		tierMin,
		tierMax,
		priceMin,
		priceMax,
		q,
		sort = "price",
		dir = "desc",
		limit = "200",
		offset = "0",
	} = query;

	const mId = Number(modelId);
	const lim = Math.min(500, Math.max(1, Number(limit)));
	const off = Math.max(0, Number(offset));

	// sort whitelist
	const sortCol =
		sort === "value" ? "v.total_value" :
		sort === "price" ? "v.est_auction_value" :
		"v.est_auction_value";

	const sortDir = (String(dir).toLowerCase() === "asc") ? "ASC" : "DESC";

	const { clause: posClause, params: posParams } = slotWhereClause(pos);

	// Filters
	let where = `
		WHERE v.model_id = ?
		AND taken.player_pk IS NULL
	`;
	const params: any[] = [mId];

	// Group filter
	const g = String(group).toLowerCase();
	if (g === "hitter") {
		where += ` AND pl.position = 'B'`;
	} else if (g === "pitcher") {
		where += ` AND pl.position = 'P'`;
	} // else "all" => no extra clause

	if (tierMin) { where += ` AND v.tier >= ?`; params.push(Number(tierMin)); }
	if (tierMax) { where += ` AND v.tier <= ?`; params.push(Number(tierMax)); }

	if (priceMin) { where += ` AND v.est_auction_value >= ?`; params.push(Number(priceMin)); }
	if (priceMax) { where += ` AND v.est_auction_value <= ?`; params.push(Number(priceMax)); }

	if (q && q.trim().length > 0) {
		// Name search. If you also have normalised_name, add it here too.
		where += ` AND pl.name LIKE ?`;
		params.push(`%${q.trim()}%`);
	}

	where += posClause;
	params.push(...posParams);

	// We use a derived "taken" set: keepers + purchases
	// Using UNION ALL + DISTINCT is fast enough at this scale.
	const baseSql = `
		SELECT
			v.player_pk,
			pl.name,
			pl.mlb_team,
			pl.position,
			pl.eligible_positions,
			pl.headshot_url,

			pl.is_c, pl.is_1b, pl.is_2b, pl.is_3b, pl.is_ss, pl.is_of, pl.is_util,
			pl.is_sp, pl.is_rp,

			v.total_value,
			v.est_auction_value,
			v.est_max_auction_value,
			v.tier,
			v.reliability_score,
			v.risk_score
		FROM draft_player_values v
		JOIN players pl ON pl.id = v.player_pk
		LEFT JOIN (
			SELECT DISTINCT player_pk
			FROM (
				SELECT player_pk FROM draft_keepers WHERE draft_id = ?
				UNION ALL
				SELECT player_pk FROM draft_purchases WHERE draft_id = ?
			) x
		) taken ON taken.player_pk = v.player_pk
		${where}
		ORDER BY ${sortCol} ${sortDir}, v.total_value DESC, pl.name ASC
		LIMIT ? OFFSET ?
	`;

	// Note: draftId used twice for the taken subquery
	const finalParams = [draftId, draftId, ...params, lim, off];

	// Total count (for pagination UI)
	const countSql = `
		SELECT COUNT(*) AS total
		FROM draft_player_values v
		JOIN players pl ON pl.id = v.player_pk
		LEFT JOIN (
			SELECT DISTINCT player_pk
			FROM (
				SELECT player_pk FROM draft_keepers WHERE draft_id = ?
				UNION ALL
				SELECT player_pk FROM draft_purchases WHERE draft_id = ?
			) x
		) taken ON taken.player_pk = v.player_pk
		${where}
	`;
	const countParams = [draftId, draftId, ...params];

	const [[countRow]] = await conn.query<any[]>(countSql, countParams);
	const [rows] = await conn.query<any[]>(baseSql, finalParams);

	return {
		total: Number(countRow.total ?? 0),
		rows: rows,
	};
}


