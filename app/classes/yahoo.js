const axios = require('axios');
const xml2js = require('xml2js');

class Yahoo {
    constructor( accessToken = null ) {
        this.baseLoginUrl = 'https://api.login.yahoo.com/oauth2';
        this.baseApiUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
        this.clientId = process.env.YAHOO_CLIENT_ID;
        this.clientSecret = process.env.YAHOO_CLIENT_SECRET;
        this.redirectUri = `https://${process.env.SITE_DOMAIN}/auth/redirect`;
        this.accessToken = accessToken;
    }

    async getAuthUrl() {
        const authUrl = `${this.baseLoginUrl}/request_auth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=fspt-r`;
        return authUrl;
    }

    async tokenRequest(body) {
        try {
            const response = await axios.post(`${this.baseLoginUrl}/get_token`, 
                new URLSearchParams(body),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Token request failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async apiRequest(endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.baseApiUrl}/${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
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

    async getUserLeagues() {
        return this.apiRequest('/users;use_login=1/games;game_codes=mlb/leagues');
    }

    async getLeague(leagueKey) {
        return this.apiRequest(`/league/${leagueKey}/standings`);
    }

    async getTeamRoster(teamKey, date = null) {
        let endpoint = `/team/${teamKey}/roster`;
        if (date) endpoint += `;date=${date}`;
        return this.apiRequest(endpoint);
     }

    async getAvailablePlayersForPosition(leagueKey, position ) {
        return this.apiRequest(`/league/${leagueKey}/players;status=FA;position=${position}`);
    }

    async getTokens(code) {
        const tokensResponse = await this.tokenRequest({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri
        });
        return tokensResponse;
    }

    async refreshTokens(refreshToken) {
        const newTokens = await this.tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        return newTokens;
    }
}

module.exports = Yahoo;