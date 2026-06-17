import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	HitterCategory,
	PitcherCategory,
	Position,
} from "../classes/league";
import League from "../classes/league";
import type {
	PlayerAdvancedScoringFields,
	PlayerScoringFields,
	SpanDays,
} from "../classes/player";
import Player from "../classes/player";
import Team from "../classes/team";
import type { SearchPlayersQuery } from "../controllers/playerStatsController";
import PlayerStatsController from "../controllers/playerStatsController";
import db from "../db/db";

type OrderBy = PlayerScoringFields | PlayerAdvancedScoringFields | false;
type CategoryValue = { weighted_value: number; category_tier: number | null };
type CategoryKey = HitterCategory | PitcherCategory;

const spanDaysSchema = z
	.union([z.literal(7), z.literal(14), z.literal(30)])
	.default(14);
const positionTypeSchema = z
	.enum(["B", "P", "speed", "contact", "power", "starter", "reliever"])
	.default("B");
const statTypeSchema = z.enum(["batting", "pitching"]);

function toText(data: unknown): { content: [{ type: "text"; text: string }] } {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	};
}

// Tools are split across functions so TypeScript's type instantiation depth
// doesn't accumulate across all 17 registrations in a single scope.

function registerLeagueAndRosterTools(
	server: McpServer,
	team: Team,
	league: League,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK complex generics cause TS2589/OOM
	const s = server as any;
	s.tool(
		"get_league_settings",
		"Returns league configuration: scoring categories (and their weights), roster slot counts, budget, and team count. Call this first to understand the league format.",
		{},
		async () => {
			const settings = await league.getLeagueSettings();
			return toText(settings);
		},
	);

	s.tool(
		"get_league_value_models",
		"Returns all valuation models configured for the league. Each model has an id, name, and method (z-score or SGP). Use model IDs from here when calling value-based tools (get_team_category_values, compare_teams, simulate_trade).",
		{},
		async () => {
			const currentLeague = await league.getLeague();
			const [rows] = await db.query<
				{ id: number; name: string; method: string; split_type: string }[]
			>(
				`SELECT id, name, method, split_type
                 FROM draft_value_models
                 WHERE league_id = ?
                 ORDER BY created_at DESC`,
				[currentLeague.id],
			);
			const models = Array.isArray(rows) ? rows : [];
			return toText(
				models.map((m) => ({
					id: Number(m.id),
					name: m.name,
					method: m.method,
					splitType: m.split_type,
				})),
			);
		},
	);

	s.tool(
		"get_all_teams",
		"Returns all fantasy teams in the league with their id, name, and whether it is the user's own team. Use team IDs from this response in other tools.",
		{},
		async () => {
			const teams = await team.getAllLeagueTeams();
			return toText(teams);
		},
	);

	s.tool(
		"get_my_roster",
		"Returns the user's own roster: all rostered players with name, MLB team, eligible positions, and selected position.",
		{},
		async () => {
			const roster = await team.getMyRoster();
			return toText(roster);
		},
	);

	s.tool(
		"get_team_roster",
		"Returns the roster for any league team by team ID.",
		{
			team_id: z
				.number()
				.int()
				.positive()
				.describe("The fantasy team ID (from get_all_teams)"),
		},
		async ({ team_id }: { team_id: number }) => {
			const roster = await team.getRosterForTeam(team_id);
			return toText(roster);
		},
	);
}

function registerPlayerSearchTools(
	server: McpServer,
	playerStatsController: PlayerStatsController,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK complex generics cause TS2589/OOM
	const s = server as any;
	s.tool(
		"search_players",
		"Search and rank players by position type and stats over a rolling window. Returns fantasy rankings with scoring stats and percentiles. Use is_rostered=false to see only free agents (add candidates).",
		{
			position_type: positionTypeSchema.describe(
				"B=all batters, P=all pitchers, speed/contact/power=batter watchlists, starter/reliever=pitcher watchlists",
			),
			span_days: spanDaysSchema.describe(
				"Rolling stat window: 7, 14, or 30 days",
			),
			is_rostered: z
				.boolean()
				.default(true)
				.describe("true=all players, false=free agents only"),
			position: z
				.string()
				.optional()
				.describe(
					"Filter by position slot: C, 1B, 2B, 3B, SS, OF, SP, RP, etc.",
				),
			order_by: z
				.string()
				.optional()
				.describe(
					"Sort by stat: runs, hr, rbi, sb, avg, strikeouts, era, whip, qs, sv, hld, ip, etc.",
				),
			page: z.number().int().positive().default(1),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({
			position_type,
			span_days,
			is_rostered,
			position,
			order_by,
			page,
			season_year,
		}: {
			position_type: string;
			span_days: number;
			is_rostered: boolean;
			position?: string;
			order_by?: string;
			page: number;
			season_year?: number;
		}) => {
			const results = await playerStatsController.searchPlayers({
				positionType: position_type,
				spanDays: span_days as SpanDays,
				isRostered: is_rostered,
				position: (position || false) as Position | false,
				orderBy: (order_by || false) as OrderBy,
				page,
				isUserTeam: false,
				season: season_year,
			} as SearchPlayersQuery);
			return toText(results);
		},
	);

	s.tool(
		"get_available_players",
		"Returns free agents (unrostered players) ranked by value. Shortcut for search_players with is_rostered=false. Use for add/drop analysis.",
		{
			position_type: positionTypeSchema.describe(
				"B=batters, P=pitchers, speed/contact/power/starter/reliever=watchlists",
			),
			span_days: spanDaysSchema,
			position: z
				.string()
				.optional()
				.describe("Filter by position slot: C, 1B, 2B, 3B, SS, OF, SP, RP"),
			order_by: z.string().optional(),
			page: z.number().int().positive().default(1),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({
			position_type,
			span_days,
			position,
			order_by,
			page,
			season_year,
		}: {
			position_type: string;
			span_days: number;
			position?: string;
			order_by?: string;
			page: number;
			season_year?: number;
		}) => {
			const results = await playerStatsController.searchPlayers({
				positionType: position_type,
				spanDays: span_days as SpanDays,
				isRostered: false,
				position: (position || false) as Position | false,
				orderBy: (order_by || false) as OrderBy,
				page,
				isUserTeam: false,
				season: season_year,
			} as SearchPlayersQuery);
			return toText(results);
		},
	);

	s.tool(
		"get_team_stats",
		"Returns rolling batting or pitching stats for every player on a team. Includes percentile rankings and a composite fantasy score per player.",
		{
			team_id: z.number().int().positive(),
			type: statTypeSchema,
			span_days: spanDaysSchema,
			order_by: z.string().optional().describe("Stat column to sort by"),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({
			team_id,
			type,
			span_days,
			order_by,
			season_year,
		}: {
			team_id: number;
			type: "batting" | "pitching";
			span_days: number;
			order_by?: string;
			season_year?: number;
		}) => {
			const stats = await playerStatsController.getStatsForTeam(
				team_id,
				{
					spanDays: span_days as SpanDays,
					orderBy: (order_by || false) as OrderBy,
					season: season_year,
				},
				type,
			);
			return toText(stats);
		},
	);

	s.tool(
		"get_schedule_strength",
		"Returns upcoming schedule difficulty per player on a team, based on opponent pitching/hitting quality. Useful for deciding who to start or stream in a given week.",
		{
			team_id: z.number().int().positive(),
			type: statTypeSchema.describe(
				"batting=evaluate hitters vs opposing pitching, pitching=evaluate pitchers vs opposing lineup",
			),
			start_date: z
				.string()
				.optional()
				.describe(
					"Start of date range (YYYY-MM-DD). Defaults to start of current week.",
				),
			end_date: z
				.string()
				.optional()
				.describe(
					"End of date range (YYYY-MM-DD). Defaults to end of current week.",
				),
			span_days: spanDaysSchema.describe(
				"Rolling window to use for opponent quality assessment",
			),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({
			team_id,
			type,
			start_date,
			end_date,
			span_days,
			season_year,
		}: {
			team_id: number;
			type: "batting" | "pitching";
			start_date?: string;
			end_date?: string;
			span_days: number;
			season_year?: number;
		}) => {
			const strength = await playerStatsController.getScheduleStrengthForTeam(
				team_id,
				{
					startDate: start_date || false,
					endDate: end_date || false,
					spanDays: span_days as SpanDays,
					season: season_year,
				},
				type,
			);
			return toText(strength);
		},
	);
}

function registerValueTools(
	server: McpServer,
	league: League,
	playerStatsController: PlayerStatsController,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK complex generics cause TS2589/OOM
	const s = server as any;
	s.tool(
		"get_team_category_values",
		"Returns a team's total value per scoring category (e.g. HR, RBI, K, ERA) along with league average and league ranking for each category. Essential for identifying category strengths/weaknesses before a trade or matchup.",
		{
			team_id: z.number().int().positive(),
			model_id: z
				.number()
				.int()
				.positive()
				.describe("Valuation model ID (from get_league_value_models)"),
			span_days: spanDaysSchema,
		},
		async ({ team_id, model_id, span_days }: { team_id: number; model_id: number; span_days: number }) => {
			const currentLeague = await league.getLeague();
			const values = await playerStatsController.getValueStatsForTeam(
				currentLeague.id,
				team_id,
				model_id,
				span_days as SpanDays,
				"scoring",
			);
			return toText(values);
		},
	);

	s.tool(
		"get_team_position_values",
		"Returns a team's value broken down by roster slot (C, 1B, OF, SP, RP, etc.) with league ranking per slot. Helps identify positional weaknesses.",
		{
			team_id: z.number().int().positive(),
			model_id: z.number().int().positive(),
			span_days: spanDaysSchema,
		},
		async ({ team_id, model_id, span_days }: { team_id: number; model_id: number; span_days: number }) => {
			const currentLeague = await league.getLeague();
			const values = await playerStatsController.getValueStatsForTeam(
				currentLeague.id,
				team_id,
				model_id,
				span_days as SpanDays,
				"position",
			);
			return toText(values);
		},
	);

	s.tool(
		"compare_teams",
		"Side-by-side category value comparison between two teams. Returns category totals and league rankings for both. Use before a trade to understand what each team needs.",
		{
			team_id_a: z
				.number()
				.int()
				.positive()
				.describe("First team (usually your team)"),
			team_id_b: z
				.number()
				.int()
				.positive()
				.describe("Second team (trade partner)"),
			model_id: z.number().int().positive(),
			span_days: spanDaysSchema,
		},
		async ({
			team_id_a,
			team_id_b,
			model_id,
			span_days,
		}: {
			team_id_a: number;
			team_id_b: number;
			model_id: number;
			span_days: number;
		}) => {
			const currentLeague = await league.getLeague();
			const [valuesA, valuesB] = await Promise.all([
				playerStatsController.getValueStatsForTeam(
					currentLeague.id,
					team_id_a,
					model_id,
					span_days as SpanDays,
					"scoring",
				),
				playerStatsController.getValueStatsForTeam(
					currentLeague.id,
					team_id_b,
					model_id,
					span_days as SpanDays,
					"scoring",
				),
			]);
			return toText({
				team_a: { team_id: team_id_a, categories: valuesA },
				team_b: { team_id: team_id_b, categories: valuesB },
			});
		},
	);

	s.tool(
		"simulate_trade",
		"Evaluates a trade by comparing the total value and per-category value of players being given vs received. Returns individual player breakdowns and a net value delta per category. Positive delta = improvement for the receiving team.",
		{
			give_player_ids: z
				.array(z.number().int().positive())
				.min(1)
				.describe("player IDs (p.id) being given away"),
			receive_player_ids: z
				.array(z.number().int().positive())
				.min(1)
				.describe("player IDs (p.id) being received"),
			model_id: z.number().int().positive(),
			span_days: spanDaysSchema,
		},
		async ({
			give_player_ids,
			receive_player_ids,
			model_id,
			span_days,
		}: {
			give_player_ids: number[];
			receive_player_ids: number[];
			model_id: number;
			span_days: number;
		}) => {
			const [givePlayers, receivePlayers] = await Promise.all([
				playerStatsController.getScoringCategoryStatsForPlayers(
					give_player_ids,
					model_id,
					span_days as SpanDays,
				),
				playerStatsController.getScoringCategoryStatsForPlayers(
					receive_player_ids,
					model_id,
					span_days as SpanDays,
				),
			]);

			const giveTotal = givePlayers.reduce(
				(sum, p) => sum + (p.total_value ?? 0),
				0,
			);
			const receiveTotal = receivePlayers.reduce(
				(sum, p) => sum + (p.total_value ?? 0),
				0,
			);

			// Use the current league's enabled scoring categories instead of a hardcoded set.
			const leagueSettings = await league.getLeagueSettings();
			const ENABLED_CATEGORIES: readonly CategoryKey[] = leagueSettings.scoring_categories
				.filter((c) => c.is_enabled)
				.map((c) => c.category_code as CategoryKey);
			const categoryDelta: Record<string, number> = {};
			for (const cat of ENABLED_CATEGORIES) {
				const asMap = (p: unknown) =>
					(p as Record<CategoryKey, CategoryValue | undefined>)[cat];
				const giveSum = givePlayers.reduce(
					(sum, p) => sum + (asMap(p)?.weighted_value ?? 0),
					0,
				);
				const receiveSum = receivePlayers.reduce(
					(sum, p) => sum + (asMap(p)?.weighted_value ?? 0),
					0,
				);
				if (giveSum !== 0 || receiveSum !== 0) {
					categoryDelta[cat] = receiveSum - giveSum;
				}
			}

			return toText({
				summary: {
					net_value_delta: receiveTotal - giveTotal,
					give_total_value: giveTotal,
					receive_total_value: receiveTotal,
				},
				category_delta: categoryDelta,
				give_players: givePlayers,
				receive_players: receivePlayers,
			});
		},
	);
}

function registerPitchingTools(
	server: McpServer,
	playerStatsController: PlayerStatsController,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK complex generics cause TS2589/OOM
	const s = server as any;
	s.tool(
		"get_probable_pitchers_for_team",
		"Returns upcoming probable pitching starts for a team's rostered pitchers, including two-start flags, QS likelihood scores, and rolling stats.",
		{
			team_id: z.number().int().positive(),
			start_date: z
				.string()
				.optional()
				.describe("YYYY-MM-DD, defaults to start of current week"),
			end_date: z
				.string()
				.optional()
				.describe("YYYY-MM-DD, defaults to end of current week"),
		},
		async ({ team_id, start_date, end_date }: { team_id: number; start_date?: string; end_date?: string }) => {
			const result = await playerStatsController.getProbablesStatsForTeam(
				team_id,
				{ startDate: start_date || false, endDate: end_date || false },
			);
			return toText(result);
		},
	);

	s.tool(
		"get_two_start_pitchers",
		"Returns available (free agent) starting pitchers with two starts in the given week, ranked by QS likelihood and rolling performance. Key tool for weekly streaming decisions.",
		{
			start_date: z
				.string()
				.optional()
				.describe("YYYY-MM-DD, defaults to start of current week"),
			end_date: z
				.string()
				.optional()
				.describe("YYYY-MM-DD, defaults to end of current week"),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({ start_date, end_date, season_year }: { start_date?: string; end_date?: string; season_year?: number }) => {
			const pitchers = await playerStatsController.getAvailablePitchers(
				{ startDate: start_date || false, endDate: end_date || false, season: season_year },
				"two-start",
			);
			return toText(pitchers);
		},
	);

	s.tool(
		"get_streaming_pitchers",
		"Returns available starting pitchers recommended for daily streaming, ranked by a composite score of opponent quality, park factors, and rolling performance.",
		{
			start_date: z
				.string()
				.optional()
				.describe("YYYY-MM-DD, defaults to today"),
			end_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({ start_date, end_date, season_year }: { start_date?: string; end_date?: string; season_year?: number }) => {
			const pitchers = await playerStatsController.getAvailablePitchers(
				{ startDate: start_date || false, endDate: end_date || false, season: season_year },
				"daily-streamer",
			);
			return toText(pitchers);
		},
	);

	s.tool(
		"get_nrfi_pitchers",
		"Returns starting pitchers ranked for No Run First Inning (NRFI) bets, based on first-inning performance and opponent quality.",
		{
			start_date: z
				.string()
				.optional()
				.describe("YYYY-MM-DD, defaults to today"),
			end_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
			season_year: z.number().int().optional().describe("Season year (e.g. 2025). Defaults to current year."),
		},
		async ({ start_date, end_date, season_year }: { start_date?: string; end_date?: string; season_year?: number }) => {
			const pitchers = await playerStatsController.getAvailablePitchers(
				{ startDate: start_date || false, endDate: end_date || false, season: season_year },
				"nrfi",
			);
			return toText(pitchers);
		},
	);
}

function registerPlayerGameTools(
	server: McpServer,
	playerStatsController: PlayerStatsController,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK complex generics cause TS2589/OOM
	const s = server as any;

	s.tool(
		"get_player_game_logs",
		"Returns recent game-by-game logs for one or more players. Each row includes all batting stats (ab, h, r, hr, rbi, sb, bb, k, singles, doubles, triples, total_bases) and pitching stats (ip, er, hits_allowed, walks_allowed, strikeouts, qs, sv, hld, nrfi, home_runs_allowed, batters_faced) plus fantasy_points. Pass player_ids for batch mode.",
		{
			player_id: z.number().int().positive().optional().describe("Single player ID (players.id). Use this or player_ids."),
			player_ids: z.array(z.number().int().positive()).optional().describe("Batch mode: fetch last_n logs for each player."),
			last_n: z.number().int().positive().default(10).describe("Number of most-recent games per player (max 50, default 10)."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_id, player_ids, last_n, season_year }: { player_id?: number; player_ids?: number[]; last_n: number; season_year?: number }) => {
			const ids = player_ids ?? (player_id ? [player_id] : []);
			const results = await playerStatsController.getPlayerGameLogs(ids, last_n, season_year);
			return toText(results);
		},
	);

	s.tool(
		"get_player_savant_profile",
		"Returns the full Statcast/Savant season profile for a player including raw stats and percentile rankings. Batters: barrel%, hard-hit%, avg EV, sweet-spot%, chase%, contact%, wOBA, wRC+, sprint speed. Pitchers: FIP, xFIP, K/9, BB/9, CSW%, swinging-strike%, GB%. Shared: ERA, WHIP, QS, SV, HLD.",
		{
			player_id: z.number().int().positive().describe("Player ID (players.id)."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_id, season_year }: { player_id: number; season_year?: number }) => {
			const results = await playerStatsController.getPlayerSavantProfile(player_id, season_year);
			return toText(results);
		},
	);

	s.tool(
		"get_player_advanced_rolling",
		"Returns rolling advanced peripherals (wOBA, OPS+, ISO, contact%, K-rate, BB-rate, BABIP, FIP, FIP-, ERA-, K/9, BB/9, K-BB ratio, LOB%, HR/9, wRAA) with percentile rankings and reliability score for a configurable window. Use position to pin two-way players like Ohtani to one role.",
		{
			player_id: z.number().int().positive().describe("Player ID (players.id)."),
			span_days: spanDaysSchema.describe("Rolling window: 7, 14, or 30 days."),
			position: z.string().optional().describe("Pin to 'B' (batter) or 'P' (pitcher) for two-way players."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_id, span_days, position, season_year }: { player_id: number; span_days: number; position?: string; season_year?: number }) => {
			const results = await playerStatsController.getPlayerAdvancedRolling(player_id, span_days, season_year, position);
			return toText(results);
		},
	);

	s.tool(
		"get_player_matchup_context",
		"Returns today's (or a specific date's) matchup context for a player: opposing starter stats/hand, how the relevant team performs against that pitcher type, and home/away flag. For batters: opposing pitcher + team split vs that hand. For pitchers: opposing lineup split vs the pitcher's arm.",
		{
			player_id: z.number().int().positive().describe("Player ID (players.id)."),
			game_date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_id, game_date, season_year }: { player_id: number; game_date?: string; season_year?: number }) => {
			const result = await playerStatsController.getPlayerMatchupContext(player_id, game_date, season_year);
			return toText(result);
		},
	);

	s.tool(
		"get_recent_splits",
		"Returns last-7, prior-7, last-14, and last-30 rolling stat windows for a player, plus a trend label (heating_up / cooling / steady) based on comparing last-7 vs prior-7 fantasy points. Useful for identifying hot/cold streaks before add/drop decisions.",
		{
			player_id: z.number().int().positive().describe("Player ID (players.id)."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_id, season_year }: { player_id: number; season_year?: number }) => {
			const result = await playerStatsController.getPlayerRecentSplits(player_id, season_year);
			return toText(result);
		},
	);

	s.tool(
		"compare_players",
		"Returns rolling stats and percentile rankings for 2–5 players side-by-side in the same shape as search_players. Use for quick head-to-head comparison before a trade or add/drop decision.",
		{
			player_ids: z.array(z.number().int().positive()).min(2).max(5).describe("List of 2–5 player IDs (players.id)."),
			span_days: spanDaysSchema.describe("Rolling window: 7, 14, or 30 days."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_ids, span_days, season_year }: { player_ids: number[]; span_days: number; season_year?: number }) => {
			const results = await playerStatsController.getPlayersByIds(player_ids, span_days, season_year);
			return toText(results);
		},
	);

	s.tool(
		"get_player_streak_status",
		"Returns active streak information for a player: hit streak, on-base streak, multi-hit streak, scoreless innings streak (pitchers), consecutive quality starts (pitchers), games since last HR, games since last SB, and last active game date.",
		{
			player_id: z.number().int().positive().describe("Player ID (players.id)."),
			season_year: z.number().int().optional().describe("Season year. Defaults to current."),
		},
		async ({ player_id, season_year }: { player_id: number; season_year?: number }) => {
			const result = await playerStatsController.getPlayerStreakStatus(player_id, season_year);
			return toText(result);
		},
	);
}

export function createMcpServer(): McpServer {
	const server = new McpServer({
		name: "fantasy-baseball-assistant",
		version: "1.0.0",
	});

	const team = new Team(db);
	const player = new Player(db);
	const league = new League(db);
	const playerStatsController = new PlayerStatsController(player);

	registerLeagueAndRosterTools(server, team, league);
	registerPlayerSearchTools(server, playerStatsController);
	registerValueTools(server, league, playerStatsController);
	registerPitchingTools(server, playerStatsController);
	registerPlayerGameTools(server, playerStatsController);

	return server;
}
