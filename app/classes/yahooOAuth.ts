import axios from 'axios';
import xml2js from 'xml2js';

interface TokenRequestBody {
    grant_type: 'authorization_code' | 'refresh_token';
    code?: string;
    redirect_uri?: string;
    refresh_token?: string;
}

export type YahooResponse = {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    xoauth_yahoo_guid: string;
}

class YahooOAuth {
    private baseLoginUrl: string;
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor() {
        this.baseLoginUrl = 'https://api.login.yahoo.com/oauth2';
        this.clientId = process.env.YAHOO_CLIENT_ID || '';
        this.clientSecret = process.env.YAHOO_CLIENT_SECRET || '';
        this.redirectUri = `https://${process.env.SITE_DOMAIN || ''}/auth/redirect`;
    }

    getAuthUrl(): string {
        const authUrl = `${this.baseLoginUrl}/request_auth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=fspt-r`;
        return authUrl;
    }

    async tokenRequest(body: TokenRequestBody): Promise<YahooResponse> {
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
            throw new Error(error.response?.data || error.message);
        }
    }

    async getToken(code: string): Promise<YahooResponse> {
        const tokenResponse = await this.tokenRequest({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri
        });
        return tokenResponse;
    }

    async getRefreshToken(refreshToken: string): Promise<YahooResponse> {
        const refreshTokenResponse = await this.tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        return refreshTokenResponse;
    }
}

export default YahooOAuth;