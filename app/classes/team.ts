import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { QueryableDB } from '../db/db';
import { POSITION_MAP, normalisedName, convertYahooTeamAbbr } from '../utils';
import Yahoo from './yahoo';
import Hydrator from './hydrator';

/** Row shape for SELECTs from the teams table. Extends RowDataPacket so query<T>() accepts it. */
interface Team extends RowDataPacket {
	id: number;
	yahoo_team_id: string;
	team_name: string;
	is_user_team: boolean;
}

interface Player extends RowDataPacket {
	id: number;
	name: string;
	mlb_team: string;
	eligible_positions: string;
	selected_position: string;
	headshot_url: string;
}
/** Yahoo league team; must have team_key and name, may have other API fields (e.g. managers). */
interface YahooLeagueTeam {
	team_key: string;
	name: string;
	managers: {
	manager: {
	is_current_login: string;
	}[];
	};
}

interface PositionFlag {
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

class Team {
	private db: QueryableDB;
	private yahoo: Yahoo;
	private teamsTable: string;
	private playersTable: string;
	private syncMetadataTable: string;
	private playerHydrator: Hydrator;

	/** Column names for full team SELECTs. Single source of truth for the Team row shape. */
	private readonly TEAM_SELECT_COLUMNS = ['id', 'yahoo_team_id', 'team_name', 'is_user_team'] as const;

	constructor(db: QueryableDB, yahooInstance: Yahoo, playerHydrator: Hydrator) {
	this.db = db;
	this.yahoo = yahooInstance;
	this.teamsTable = 'teams';
	this.playersTable = 'players';
	this.syncMetadataTable = 'sync_metadata';
	this.playerHydrator = playerHydrator;
	}

	async syncMyRoster(): Promise<void> {
	let teamKey: string | null = await this.getTeamKeyForUser();
	if (!teamKey) {
		// Step 1: Get the user's GUID and league key from Yahoo
		const leagueKey: string | null = await this.getMyLeagueKey();
		if (!leagueKey) {
		throw new Error('Failed to get league key');
		}

		// Step 2: Get the user's team from the league
		const teams: YahooLeagueTeam[] = await this.getMyLeagueTeams(leagueKey);
		
		// Step 3: Filter teams by team where team.managers contains manager where manager.is_current_login is '1
		const team: YahooLeagueTeam | null = this.getMyTeamFromLeagueResponse(teams);
		if (!team) {
		throw new Error('Failed to get my team');
		}

		teamKey = team.team_key;
		const teamName = team.name;

		// Upsert team
		const [teamResult] = await this.db.query<ResultSetHeader>(
		`INSERT INTO ${this.teamsTable} (yahoo_team_id, team_name, is_user_team)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE team_name = VALUES(team_name), is_user_team = VALUES(is_user_team)`,
		[teamKey, teamName, true]
		);
		if (teamResult.affectedRows !== 1) {
		throw new Error('Failed to upsert team');
		}
	}
	await this.syncRosterForTeam(teamKey as string);
	return;
	}

	async syncAllLeagueTeams(): Promise<void> {
	await this.updateAllLeagueTeams();
	let teams = await this.getAllLeagueTeams();
	if (teams.length === 0) {
	throw new Error('No league teams found');
	}
	if (true || await this.isSyncStale()) {
	for (const team of teams) {
		await this.syncRosterForTeam(team.yahoo_team_id);
	}
	await this.storeSyncTimestamp();
	teams = await this.getAllLeagueTeams();
	}
	return;
	}

	async syncRosterForLeagueTeam( teamId: number ): Promise<void> {
	const [[{ yahoo_team_id: teamKey }]] = await this.db.query<Team[]>(`SELECT yahoo_team_id FROM ${this.teamsTable} WHERE id = ?`, [teamId]);
	await this.syncRosterForTeam(teamKey);
	return;
	}

	async updateAllLeagueTeams(): Promise<void> {
	let [teams] = await this.db.query<Team[]>(`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable}`);
	if (teams.length < 10) {
	const leagueKey: string | null = await this.getMyLeagueKey();
	if (!leagueKey) {
		throw new Error('Failed to get league key');
	}
	const leagueTeams: YahooLeagueTeam[] = await this.getMyLeagueTeams( leagueKey );
	const myTeamKey: string | null = await this.getTeamKeyForUser();
	if (!myTeamKey) {
		throw new Error('Failed to get my team key');
	}
	for (const team of leagueTeams) {
		const teamKey = team.team_key;
		const teamName = team.name;
		const isUserTeam = teamKey === myTeamKey;

		// Upsert team
		const [teamResult] = await this.db.query<ResultSetHeader>(
		`INSERT INTO ${this.teamsTable} (yahoo_team_id, team_name, is_user_team)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE team_name = VALUES(team_name)`,
		[teamKey, teamName, isUserTeam]
		);
	}
	}
	return;
	}

	async getAllLeagueTeams(): Promise<Team[]> {
	const [teams] = await this.db.query<Team[]>(`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable}`);
	return teams;
	}

	async updateAllOpponentLeagueTeams(): Promise<void> {
	let [teams] = await db.query(`SELECT id, team_name FROM ${this.teamsTable} WHERE is_user_team = false`);
	if (teams.length === 0) {
	const leagueKey = await this.getMyLeagueKey();
	const leagueTeams = await this.getMyLeagueTeams( leagueKey );
	const myTeamKey = await this.getTeamKeyForUser();
	for (const team of leagueTeams) {
		if (team.team_key === myTeamKey) {
		continue;
		}
		const teamKey = team.team_key;
		const teamName = team.name;

		// Upsert team
		const [teamResult] = await db.query(
		`INSERT INTO ${this.teamsTable} (yahoo_team_id, team_name, is_user_team)
		VALUES (?, ?, false)
		ON DUPLICATE KEY UPDATE team_name = VALUES(team_name)`,
		[teamKey, teamName]
		);
	}
	}
	return;
	}

	async getAllOpponentLeagueTeams(): Promise<Team[]> {
	const [teams] = await this.db.query<Team[]>(`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE is_user_team = false`);
	return teams;
	}

	async syncRosterForTeam( teamKey: string ): Promise<void> {
	const [[{ id: teamId }]] = await this.db.query<Team[]>(`SELECT id FROM ${this.teamsTable} WHERE yahoo_team_id = ?`, [teamKey]);

	// Step 2: Get the current roster
	console.log('getting my team roster');
	// console.log(util.inspect(rosterRes, false, null));
	const rosterRes = await this.yahoo.getTeamRoster(teamKey);
	
	const players = rosterRes.fantasy_content.team.roster.players.player;
	
	// Clear existing rostered players for this team
	await this.db.query<ResultSetHeader>(`UPDATE ${this.playersTable} SET status = ?, team_id = NULL WHERE team_id = ?`, ['free_agent', teamId]);
	
	for (const player of players) {
	const playerId = player.player_key;
	const name = player.name.full;
	const mlbTeam = convertYahooTeamAbbr(player.editorial_team_abbr);
	const eligiblePositions = JSON.stringify(player.eligible_positions.position || []);
	const positionFlags = this.parseEligiblePositions(eligiblePositions, name);
	const selectedPosition = player.selected_position.position || '';
	const headshotUrl = player.headshot?.url || '';
	
	let position = 'B';
	if (positionFlags.is_sp === 1 || positionFlags.is_rp === 1) {
		position = 'P';
	}

	// console.log('Inserting player:', {
	//   playerId, teamId, name, mlbTeam, eligiblePositions, selectedPosition, headshotUrl, positionFlags
	// });
	
	await this.db.query(
		`INSERT INTO ${this.playersTable} 
		(yahoo_player_id, team_id, name, normalised_name, mlb_team, eligible_positions, selected_position, position, headshot_url, status, is_c, is_1b, is_2b, is_3b, is_ss, is_of, is_util, is_sp, is_rp)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
		team_id = VALUES(team_id),
		status = VALUES(status),
		mlb_team = VALUES(mlb_team),
		eligible_positions = VALUES(eligible_positions),
		selected_position = VALUES(selected_position),
		position = VALUES(position),
		headshot_url = VALUES(headshot_url),
		is_c = VALUES(is_c),
		is_1b = VALUES(is_1b),
		is_2b = VALUES(is_2b),
		is_3b = VALUES(is_3b),
		is_ss = VALUES(is_ss),
		is_of = VALUES(is_of),
		is_util = VALUES(is_util),
		is_sp = VALUES(is_sp),
		is_rp = VALUES(is_rp)`,
		[playerId, teamId, name, normalisedName(name), mlbTeam, eligiblePositions, selectedPosition, position, headshotUrl, 'rostered', positionFlags.is_c, positionFlags.is_1b, positionFlags.is_2b, positionFlags.is_3b, positionFlags.is_ss, positionFlags.is_of, positionFlags.is_util, positionFlags.is_sp, positionFlags.is_rp]
	);
	}

	await this.playerHydrator.hydratePlayerIds();
	return;
	}

	async getAllPlayersWithPosition( position: string ): Promise<Player[]> {
	const flagKey = POSITION_MAP[position];
	if (!flagKey) {
	throw new Error(`Invalid position ${position}`);
	}
	const [players] = await this.db.query<Player[]>(
	`SELECT name, mlb_team FROM ${this.playersTable} WHERE ${flagKey} = 1 AND status = 'rostered'`
	);
	return players;
	}

	async getAvailablePlayersForPositions( eligiblePositions: string[] ): Promise<Player[]> {
	const conditions = eligiblePositions
	.filter(pos => POSITION_MAP[pos])
	.map(pos => `${POSITION_MAP[pos]} = ?`);
	if (conditions.length === 0) {
	throw new Error('No valid positions provided');
	}
	const values = Array.from({ length: conditions.length }, () => 1);
	const [rostered] = await this.db.query<Player[]>(
	`SELECT name, mlb_team FROM ${this.playersTable} WHERE (${conditions.join(' OR ')}) AND status = ?`,
	[...values, 'rostered']
	);
	return rostered;
	}

	async getMyLeagueKey(): Promise<string | null> {
	const userResult = await this.yahoo.getUserLeagues();
	// console.log('getting my team');
	// console.log(util.inspect(userResult, false, null));
	
	const games = userResult.fantasy_content.users.user.games.game;
	const activeGames = games.filter(game => game.is_game_over === '0');
	const leagueKey = activeGames[0].leagues.league.league_key;

	return leagueKey || null;
	}

	async getMyLeagueTeams( leagueKey: string ): Promise<YahooLeagueTeam[]> {
	const leagueResult = await this.yahoo.getLeague(leagueKey);
	console.log('getting my league teams');
	const teams: YahooLeagueTeam[] = leagueResult.fantasy_content.league.standings.teams.team;
	return teams;
	}

	getMyTeamFromLeagueResponse(teams: YahooLeagueTeam[]): YahooLeagueTeam | null {
	return teams.find(team =>
	team.managers.manager.some(m => m.is_current_login === '1')
	) ?? null;
	}

	async getMyRoster(): Promise<Player[]> {
	const [[team]] = await this.db.query<Team[]>(
		`SELECT id FROM ${this.teamsTable} WHERE is_user_team = true LIMIT 1`
	);
	if (!team) {
		throw new Error('No user team found');
	}
	const teamId = team.id;
	const [players] = await this.db.query<Player[]>(
		`SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM ${this.playersTable} WHERE team_id = ?`,
		[teamId]
	);
	return players;
	}

	async getTeamKeyForTeam( teamId: number ): Promise<string | null> {
	const [team] = await this.db.query<Team[]>(
	`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE id = ?`,
	[teamId]
	);
	return team?.[0]?.yahoo_team_id || null;
	}

	async getTeamKeyForUser(): Promise<string | null> {
	const [teams] = await this.db.query<Team[]>(
	`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE is_user_team = true LIMIT 1`
	);
	return teams?.[0]?.yahoo_team_id || null;
	}

	async getPlayer( playerId: number ): Promise<Player | null> {
	const [player] = await this.db.query<Player[]>(
	`SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM ${this.playersTable} WHERE id = ?`,
	[playerId]
	);
	return player?.[0] || null;
	}
	
	async getRosterForTeam( teamId: number ): Promise<Player[]> {
	const [players] = await this.db.query<Player[]>(
	`SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM ${this.playersTable} WHERE team_id = ?`,
	[teamId]
	);
	return players;
	}

	parseEligiblePositions( eligiblePositions: string, name: string ): PositionFlag {
	const positionFlags: PositionFlag = {
	is_c: 0,
	is_1b: 0,
	is_2b: 0,
	is_3b: 0,
	is_ss: 0,
	is_of: 0,
	is_util: 0,
	is_sp: 0,
	is_rp: 0
	};
	let rawPositions;
	try {
	rawPositions = JSON.parse(eligiblePositions);
	} catch (error) {
	console.error('Failed to parse eligible positions for player:', name, ':', eligiblePositions, error);
	rawPositions = [];
	}

	const normalisedPositions = Array.isArray(rawPositions)
	? rawPositions.map(pos => {
		if (typeof pos === 'string') {
		return pos;
		} else if (pos && typeof pos === 'object' && pos.position) {
		return pos.position;
		}
		return null;
	}).filter(pos => pos !== null)
	: [];

	normalisedPositions.forEach((pos: string) => {
	// Normalize position to uppercase to match POSITION_MAP keys
	const cleanPos = pos ? pos.toUpperCase() : '';
	const flagKey = POSITION_MAP[cleanPos];
	if (flagKey) {
		positionFlags[flagKey] = 1;
	} else {
		// Log unknown positions for debugging
		console.log(`Unknown position: "${pos}" (normalized: "${cleanPos}")`);
	}
	});

	return positionFlags;
	}

	async storeSyncTimestamp(): Promise<void> {
	await this.db.query(
	`INSERT INTO ${this.syncMetadataTable} (key_name, last_synced) VALUES ('league_rosters', NOW())
	ON DUPLICATE KEY UPDATE last_synced = NOW()`
	);
	}

	async isSyncStale(): Promise<boolean> {
	const [rows] = await this.db.query<{ last_synced: string }[]>(
	`SELECT last_synced FROM ${this.syncMetadataTable} WHERE key_name = ?`,
	['league_rosters']
	);
	
	return !rows[0] || new Date().getTime() - new Date(rows[0].last_synced).getTime() > (1000 * 60 * 60);
	}
}

export default Team;