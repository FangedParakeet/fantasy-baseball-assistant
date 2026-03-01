import type Token from '../classes/token';
import type { AccessToken } from '../classes/token';
import type YahooOAuth from '../classes/yahooOAuth';
import type { YahooResponse } from '../classes/yahooOAuth';

export type TokenResponse = {
    hasToken: boolean;
    hasValidToken: boolean;
    expiresAt: string | null;
}

class TokenController {
    constructor(private token: Token, private yahoo: YahooOAuth) {}

    getAuthUrl(): string {
        return this.yahoo.getAuthUrl();
    }
    
    async getStatus(): Promise<TokenResponse> {
        const accessToken: AccessToken = await this.token.get();
        const hasValidToken: boolean = !!accessToken.access_token && 
                             !!accessToken.expires_in && 
                             new Date(accessToken.expires_in) > new Date();
        return {
            hasToken: !!accessToken.access_token,
            hasValidToken: hasValidToken,
            expiresAt: accessToken.expires_in,
        } as TokenResponse;
    }

    async getToken(): Promise<AccessToken> {
        const token: AccessToken = await this.token.get();
        if (!token.access_token) {
            throw new Error('No token available');
        }

        const isExpired: boolean = !!token.expires_in && new Date(token.expires_in) < new Date();
        if (isExpired) {
            throw new Error('Token expired');
        }

        return token as AccessToken;
    }

    async getOrRefreshToken(): Promise<AccessToken> {
        const token = await this.token.get();
        if (!token.access_token) {
            throw new Error('No token available. Please authenticate with Yahoo first.');
        }

        const isExpired: boolean = !!token.expires_in && new Date(token.expires_in) < new Date();
        if (isExpired) {
            if (!token.refresh_token) {
                throw new Error('No refresh token available. Please re-authenticate with Yahoo.');
            }
            const newToken: YahooResponse = await this.yahoo.getRefreshToken(token.refresh_token);
            await this.token.set(newToken as AccessToken);
            return newToken as AccessToken;
        }
        return token as AccessToken;
    }

    async exchangeCodeForToken(code: string): Promise<void> {
        const tokenResponse: YahooResponse = await this.yahoo.getToken(code);
        await this.token.set(tokenResponse as AccessToken);
    }

    async refreshToken(): Promise<void> {
        const oldToken: AccessToken = await this.token.get();
        if (!oldToken.refresh_token) {
            throw new Error('No refresh token available');
        }
        const newToken: YahooResponse = await this.yahoo.getRefreshToken(oldToken.refresh_token);
        await this.token.set(newToken as AccessToken);
    }
}

export default TokenController;