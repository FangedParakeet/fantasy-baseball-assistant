import axios from 'axios';
import xml2js from 'xml2js';

interface TokenRequestBody {
    grant_type: 'authorization_code' | 'refresh_token';
    code?: string;
    redirect_uri?: string;
    refresh_token?: string;
}

export type YahooError = {
    error: string;
}
export type YahooResponse = {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    xoauth_yahoo_guid: string;
}

class Yahoo {
    private baseLoginUrl: string;
    private baseApiUrl: string;
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    private authToken: string | null;

    constructor( authToken = null ) {
        this.baseLoginUrl = 'https://api.login.yahoo.com/oauth2';
        this.baseApiUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
        this.clientId = process.env.YAHOO_CLIENT_ID || '';
        this.clientSecret = process.env.YAHOO_CLIENT_SECRET || '';
        this.redirectUri = `https://${process.env.SITE_DOMAIN || ''}/auth/redirect`;
        this.authToken = authToken;
    }

    getAuthUrl(): string {
        const authUrl = `${this.baseLoginUrl}/request_auth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=fspt-r`;
        return authUrl;
    }

    async tokenRequest(body: TokenRequestBody): Promise<YahooResponse | YahooError> {
        try {
            const response = await axios.post(`${this.baseLoginUrl}/get_token`, 
                new URLSearchParams(body as unknown as Record<string, string>),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
                    }
                }
            );
            return response.data as YahooResponse;
        } catch (error) {
            console.error('Token request failed:', error.response?.data || error.message);
            return {
                error: error.response?.data || error.message
            } as YahooError;
        }
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
        } catch (error) {
            console.error('API request failed:', error.response?.data || error.message);
            throw error;
        }
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

    async getToken(code: string): Promise<YahooResponse | YahooError> {
        const tokenResponse = await this.tokenRequest({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri
        });
        return tokenResponse as YahooResponse | YahooError;
    }

    async getRefreshToken(refreshToken: string): Promise<YahooResponse | YahooError> {
        const refreshTokenResponse = await this.tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        return refreshTokenResponse as YahooResponse | YahooError;
    }
}

export default Yahoo;