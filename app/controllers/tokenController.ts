import type Token from '../classes/token';
import type { AccessToken } from '../classes/token';
import type Yahoo from '../classes/yahoo';
import type { YahooResponse, YahooError } from '../classes/yahoo';

export type TokenResponse = {
    hasToken: boolean;
    hasValidToken: boolean;
    expiresAt: string | null;
}

class TokenController {
    constructor(private token: Token, private yahoo: Yahoo) {}

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

    async exchangeCodeForToken(code: string): Promise<void> {
        const tokenResponse: YahooResponse | YahooError = await this.yahoo.getToken(code);
        if ('error' in tokenResponse) {
            if (tokenResponse.error !== null) {
                throw new Error(tokenResponse.error as string);
            }
            throw new Error('Error exchanging code for token');
        }
        await this.token.set(tokenResponse as AccessToken);
    }

    async refreshToken(): Promise<void> {
        const oldToken: AccessToken = await this.token.get();
        if (!oldToken.refresh_token) {
            throw new Error('No refresh token available');
        }
        const newToken: YahooResponse | YahooError = await this.yahoo.getRefreshToken(oldToken.refresh_token);
        if ('error' in newToken) {
            if (newToken.error !== null) {
                throw new Error(newToken.error as string);
            }
            throw new Error('Error refreshing token');
        }
        await this.token.set(newToken as AccessToken);
    }
}

export default TokenController;