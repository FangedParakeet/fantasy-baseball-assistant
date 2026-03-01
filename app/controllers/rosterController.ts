import Team from "../classes/team";
import YahooAPI from "../classes/yahooAPI";
import type { YahooLeagueTeam, YahooRosterPlayer } from "../classes/yahooAPI";
import type { LeagueTeam, RosterPlayer } from "../classes/team";
import Hydrator from "../classes/hydrator";
import { convertYahooTeamAbbr, normalisedName } from "../utils/functions";

class RosterController {
    private yahoo: YahooAPI;
    private team: Team;
    private playerHydrator: Hydrator;

    constructor(yahoo: YahooAPI, team: Team, playerHydrator: Hydrator) {
        this.yahoo = yahoo;
        this.team = team;
        this.playerHydrator = playerHydrator;
    }
    
    async syncMyRoster(): Promise<void> {
		let myTeamKey: string | null = await this.team.getTeamKeyForUser();
		if (!myTeamKey) {
			const teams: YahooLeagueTeam[] = await this.yahoo.getLeagueTeams();
			// Step 3: Filter teams by team where team.managers contains manager where manager.is_current_login is '1
			const myTeam: YahooLeagueTeam | null = this.getMyTeamFromLeagueResponse(teams);
			if (!myTeam) {
                throw new Error('Failed to get my team');
			}

			myTeamKey = myTeam.team_key;
			const teamName = myTeam.name;
			await this.team.upsertTeam({ yahoo_team_id: myTeamKey, team_name: teamName, is_user_team: true });
		}
		const myTeam = await this.team.getTeamByKey(myTeamKey);
		if (!myTeam) {
			throw new Error('Failed to get my team');
		}
		await this.syncRosterForTeam(myTeam.id);
		return;
	}

    async syncAllLeagueTeams(): Promise<void> {
		await this.upsertAllLeagueTeams();
		let teams = await this.team.getAllLeagueTeams();
		if (teams.length === 0) {
            throw new Error('No league teams found');
		}
		if (true || await this.team.isSyncStale()) {
            for (const team of teams) {
                await this.syncRosterForTeam(team.id);
            }
            await this.team.storeSyncTimestamp();
        }
		return;
	}

	async syncRosterForLeagueTeam( teamId: number ): Promise<void> {
		const team = await this.team.getTeamById(teamId);
		if (!team) {
			throw new Error('Team not found');
		}
		await this.syncRosterForTeam(team.id);
		return;
	}

	async upsertAllLeagueTeams(): Promise<void> {
		let teams: LeagueTeam[] = await this.team.getAllLeagueTeams();
		if (teams.length < 10) {
            const leagueTeams: YahooLeagueTeam[] = await this.yahoo.getLeagueTeams();
            const myTeamKey: string | null = await this.team.getTeamKeyForUser();
            if (!myTeamKey) {
                throw new Error('Failed to get my team key');
            }
            for (const team of leagueTeams) {
                await this.team.upsertTeam({ yahoo_team_id: team.team_key, team_name: team.name, is_user_team: team.team_key === myTeamKey });
            }
		}
		return;
	}

	async syncRosterForTeam( teamId: number ): Promise<void> {
		const team = await this.team.getTeamById(teamId);
		if (!team) {
			throw new Error('Team not found');
		}

		const players: YahooRosterPlayer[] = await this.yahoo.getRosterForTeam(team.yahoo_team_id);
		
		// Clear existing rostered players for this team
        await this.team.clearRosterForTeam(team.id);
	
		const rosterPlayers: RosterPlayer[] = [];
		for (const player of players) {
			const playerId = player.player_key;
			const name = player.name.full;
			const mlbTeam = convertYahooTeamAbbr(player.editorial_team_abbr);
			const rawPos = player.eligible_positions?.position;
			const posArray = Array.isArray(rawPos) ? rawPos : (rawPos != null ? [rawPos] : []);
			const eligiblePositions = JSON.stringify(posArray);
			const positionFlags = this.team.parseEligiblePositions(eligiblePositions, name);
			const selectedPosition = player.selected_position.position || '';
			const headshotUrl = player.headshot?.url || '';
			
			const position = positionFlags.is_sp === 1 || positionFlags.is_rp === 1 ? 'P' : 'B';

			rosterPlayers.push({
				yahoo_player_id: playerId,
				team_id: team.id,
				name: name,
				normalised_name: normalisedName(name),
				mlb_team: mlbTeam,
				eligible_positions: eligiblePositions,
				selected_position: selectedPosition,
				position: position,
				headshot_url: headshotUrl,
				status: 'rostered',
				is_c: positionFlags.is_c,
				is_1b: positionFlags.is_1b,
				is_2b: positionFlags.is_2b,
				is_3b: positionFlags.is_3b,
				is_ss: positionFlags.is_ss,
				is_of: positionFlags.is_of,
				is_util: positionFlags.is_util,
				is_sp: positionFlags.is_sp,
				is_rp: positionFlags.is_rp
			} as RosterPlayer);
		}
		await this.team.upsertPlayers(rosterPlayers);
		await this.playerHydrator.hydratePlayerIds();
		return;
	}

	getMyTeamFromLeagueResponse(teams: YahooLeagueTeam[]): YahooLeagueTeam | null {
		return teams.find(team => {
			const managers = team.managers?.manager;
			const list = Array.isArray(managers) ? managers : (managers ? [managers] : []);
			return list.some((m: { is_current_login: string }) => m.is_current_login === '1');
		}) ?? null;
	}

}

export default RosterController;