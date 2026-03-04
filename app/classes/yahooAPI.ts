import axios from 'axios';
import xml2js from 'xml2js';

/** Yahoo league team; must have team_key and name, may have other API fields (e.g. managers). */
export type YahooLeagueTeam = {
	team_key: string;
	name: string;
	managers: {
	manager: {
		is_current_login: string;
	}[];
	};
};

export type YahooRosterPlayer = {
    player_key: string;
    name: {
        full: string;
    };
    editorial_team_abbr: string;
    eligible_positions: {
        position: string[];
    };
    selected_position: {
        position: string;
    };
    headshot?: {
        url: string;
    };
}


class YahooAPI {
    private baseApiUrl: string;
    private authToken: string;

    constructor(authToken: string) {
        this.baseApiUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
        this.authToken = authToken;
    }

    async apiRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
        try {
            const response = await axios.get(`${this.baseApiUrl}/${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Accept': 'application/xml'
                },
                params: params
            });
            
            // Parse XML response to JSON
            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const result = await parser.parseStringPromise(response.data);
            return result;
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown }; message?: string };
            console.error('API request failed:', err.response?.data || err.message);
            throw error;
        }
    }

    async getLeagueTeams(): Promise<YahooLeagueTeam[]> {
        const leagueKey = await this.getLeagueKey();
        const league = await this.getLeague(leagueKey);
        const raw = league?.fantasy_content?.league?.standings?.teams?.team;
        if (!raw) {
            throw new Error('No teams found');
        }
        const teamList = Array.isArray(raw) ? raw : [raw];
        return teamList as YahooLeagueTeam[];
    }

    async getRosterForTeam(teamKey: string): Promise<YahooRosterPlayer[]> {
        const roster = await this.getTeamRoster(teamKey);
        const raw = roster?.fantasy_content?.team?.roster?.players?.player;
        if (!raw) {
            throw new Error('No players found');
        }
        const playerList = Array.isArray(raw) ? raw : [raw];
        return playerList as YahooRosterPlayer[];
    }

    /**
     * Gets the league from the most recent MLB game in the getUserLeagues() response.
     * API structure: fantasy_content.users.user.games.game[] (each game has .leagues.league).
     */
    private getCurrentLeagueFromResponse(leaguesResponse: any): { league_key: string; name: string; season: string } | null {
        const user = leaguesResponse?.fantasy_content?.users?.user;
        if (!user) return null;
        const gamesRaw = user.games?.game;
        if (!gamesRaw) return null;
        const games = Array.isArray(gamesRaw) ? gamesRaw : [gamesRaw];
        if (games.length === 0) return null;
        // Most recent game: sort by season descending and take first
        const sorted = [...games].sort((a, b) => Number(b.season) - Number(a.season));
        const latestGame = sorted[0];
        const leagueRaw = latestGame?.leagues?.league;
        if (!leagueRaw) return null;
        const league = Array.isArray(leagueRaw) ? leagueRaw[0] : leagueRaw;
        return league;
    }

    async getLeagueKey(): Promise<string> {
        const leagues = await this.getUserLeagues();
        const league = this.getCurrentLeagueFromResponse(leagues);
        if (!league) throw new Error('No leagues found');
        return league.league_key;
    }

    async getLeagueNameAndSeason(): Promise<{ name: string; seasonYear: number }> {
        const leagues = await this.getUserLeagues();
        const league = this.getCurrentLeagueFromResponse(leagues);
        if (!league) throw new Error('No leagues found');
        return { name: league.name, seasonYear: Number(league.season) };
    }

    async getUserLeagues(): Promise<any> {
        return this.apiRequest('/users;use_login=1/games;game_codes=mlb/leagues');
    }

    async getLeague(leagueKey: string): Promise<any> {
        return this.apiRequest(`/league/${leagueKey}/standings`);
    }

    async getTeamRoster(teamKey: string, date: string | null = null): Promise<any> {
        let endpoint = `/team/${teamKey}/roster`;
        if (date) endpoint += `;date=${date}`;
        return this.apiRequest(endpoint);
     }

    async getAvailablePlayersForPosition(leagueKey: string, position: string): Promise<any> {
        return this.apiRequest(`/league/${leagueKey}/players;status=FA;position=${position}`);
    }

}

export default YahooAPI;