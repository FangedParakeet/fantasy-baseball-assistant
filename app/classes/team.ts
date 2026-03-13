// biome-ignore assist/source/organizeImports: bitchass biome
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { QueryableDB } from "../db/db";
import { POSITION_MAP } from "../utils/constants";

/** Row shape for SELECTs from the teams table. Extends RowDataPacket so query<T>() accepts it. */
export interface LeagueTeam extends RowDataPacket {
  id: number;
	yahoo_team_id: string;
	team_name: string;
	is_user_team: boolean;
}

export interface RosterPlayer extends RowDataPacket {
	id?: number;
	yahoo_player_id: string;
	team_id: number;
	name: string;
	mlb_team: string;
	eligible_positions: string;
	selected_position: string;
	headshot_url: string;
	position: string;
	status: string;
	is_c: number;
	is_1b: number;
	is_2b: number;
	is_3b: number;
	is_ss: number;
	is_of: number;
	is_util: number;
	is_sp: number;
	is_rp: number;
	normalised_name: string;
}

type PositionFlag = {
	is_c: number;
	is_1b: number;
	is_2b: number;
	is_3b: number;
	is_ss: number;
	is_of: number;
	is_util: number;
	is_sp: number;
	is_rp: number;
};

class Team {
	private db: QueryableDB;
	private teamsTable: string;
	private playersTable: string;
	private syncMetadataTable: string;

	/** Column names for full team SELECTs. Single source of truth for the Team row shape. */
	private readonly TEAM_SELECT_COLUMNS = ['id', 'yahoo_team_id', 'team_name', 'is_user_team'] as const;

	constructor(db: QueryableDB) {
    this.db = db;
		this.teamsTable = 'teams';
		this.playersTable = 'players';
		this.syncMetadataTable = 'sync_metadata';
	}

	async getMyRoster(): Promise<RosterPlayer[]> {
		const [[team]] = await this.db.query<LeagueTeam[]>(
			`SELECT id FROM ${this.teamsTable} WHERE is_user_team = true LIMIT 1`
		);
		if (!team) {
			throw new Error('No user team found');
		}
		const teamId = team.id;
		const [players] = await this.db.query<RosterPlayer[]>(
			`SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM ${this.playersTable} WHERE team_id = ?`,
			[teamId]
		);
		return players;
	}

	async getAllLeagueTeams(): Promise<LeagueTeam[]> {
		const [teams] = await this.db.query<LeagueTeam[]>(`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable}`);
		return teams;
	}

	async getTeamKeyForTeam( teamId: number ): Promise<string | null> {
		const [team] = await this.db.query<LeagueTeam[]>(
            `SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE id = ?`,
            [teamId]
		);
		return team?.[0]?.yahoo_team_id || null;
	}

	async getTeamKeyForUser(): Promise<string | null> {
		const [teams] = await this.db.query<LeagueTeam[]>(
            `SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE is_user_team = true LIMIT 1`
		);
		return teams?.[0]?.yahoo_team_id || null;
	}

	async getTeamByKey( teamKey: string ): Promise<LeagueTeam | null> {
		const [team] = await this.db.query<LeagueTeam[]>(
		`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE yahoo_team_id = ?`,
		[teamKey]
		);
		return team?.[0] || null;
	}

	async getTeamById( teamId: number ): Promise<LeagueTeam | null> {
		const [team] = await this.db.query<LeagueTeam[]>(
			`SELECT ${this.TEAM_SELECT_COLUMNS.join(', ')} FROM ${this.teamsTable} WHERE id = ?`,
			[teamId]
		);
		return team?.[0] || null;
	}

	async getPlayer( playerId: number ): Promise<RosterPlayer | null> {
		const [player] = await this.db.query<RosterPlayer[]>(
            `SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM ${this.playersTable} WHERE id = ?`,
            [playerId]
		);
		return player?.[0] || null;
	}
	
	async getRosterForTeam( teamId: number ): Promise<RosterPlayer[]> {
		const [players] = await this.db.query<RosterPlayer[]>(
            `SELECT id, name, mlb_team, eligible_positions, selected_position, headshot_url FROM ${this.playersTable} WHERE team_id = ?`,
            [teamId]
		);
		return players;
	}

	async clearRosterForTeam( teamId: number ): Promise<void> {
		await this.db.query<ResultSetHeader>(
			`UPDATE ${this.playersTable} SET status = ?, team_id = NULL WHERE team_id = ?`,
			['free_agent', teamId]
		);
		return;
	}

	async upsertTeam( team: { yahoo_team_id: string, team_name: string, is_user_team: boolean } ): Promise<void> {
		await this.db.query<ResultSetHeader>(
			`INSERT INTO ${this.teamsTable} (yahoo_team_id, team_name, is_user_team)
			VALUES (?, ?, ?)
			ON DUPLICATE KEY UPDATE team_name = VALUES(team_name), is_user_team = VALUES(is_user_team)`,
			[team.yahoo_team_id, team.team_name, team.is_user_team]
		);
		return;
	}

	async upsertPlayers( players: RosterPlayer[] ): Promise<void> {
		await this.db.query<ResultSetHeader>(
			`INSERT INTO ${this.playersTable} (
				yahoo_player_id, 
				team_id, 
				name, 
				normalised_name, 
				mlb_team, 
				eligible_positions, 
				selected_position, 
				position, 
				headshot_url, 
				status, 
				is_c, is_1b, is_2b, is_3b, is_ss, is_of, is_util, is_sp, is_rp)
			VALUES ${players.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
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
				is_rp = VALUES(is_rp)
			`,
			players.flatMap(player => [
				player.yahoo_player_id, 
				player.team_id, 
				player.name, 
				player.normalised_name, 
				player.mlb_team, 
				player.eligible_positions, 
				player.selected_position, 
				player.position, 
				player.headshot_url, 
				player.status, 
				player.is_c, 
				player.is_1b, 
				player.is_2b, 
				player.is_3b, 
				player.is_ss, 
				player.is_of, 
				player.is_util, 
				player.is_sp, 
				player.is_rp
			])
		);
		return;
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
		let rawPositions: string[] | object;
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
            const flagKey = POSITION_MAP[cleanPos as keyof typeof POSITION_MAP];
            if (flagKey) {
                positionFlags[flagKey as keyof PositionFlag] = 1;
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
		
		return !rows[0] || Date.now()- new Date(rows[0].last_synced).getTime() > (1000 * 60 * 60);
	}
}

export default Team;