import type { QueryableDB } from '../db/db';

interface Token {
    access_token: string | null;
    refresh_token: string | null;
    expires_in: number | null;
}

interface YahooDBToken {
    yahoo_access_token: string | null;
    yahoo_refresh_token?: string;
    yahoo_token_expires_at: string | null;
}

interface TokenResponse {
    hasToken: boolean;
    hasValidToken: boolean;
    expiresAt: string | null;
}

class Token {
    private db: QueryableDB;

    constructor(db: QueryableDB) {
        this.db = db;
    }

    async status(): Promise<TokenResponse> {
        const [rows] = await this.db.query<YahooDBToken[]>('SELECT yahoo_access_token, yahoo_token_expires_at FROM tokens WHERE id = 1');
    
        if (!Array.isArray(rows) || rows.length === 0) {
          return { hasToken: false, hasValidToken: false, expiresAt: null };
        }
    
        const token = rows[0];
        const hasValidToken: boolean = !!token.yahoo_access_token && 
                             !!token.yahoo_token_expires_at && 
                             new Date(token.yahoo_token_expires_at) > new Date();

        return {
            hasToken: !!token.yahoo_access_token,
            hasValidToken: hasValidToken,
            expiresAt: token.yahoo_token_expires_at
        }
    }

    async set(tokens: Token): Promise<void> {
        const { access_token, refresh_token, expires_in } = tokens;

        // Store tokens in database (upsert)
        await this.db.query(
            `INSERT INTO tokens (id, yahoo_access_token, yahoo_refresh_token, yahoo_token_expires_at) 
             VALUES (1, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE 
             yahoo_access_token = VALUES(yahoo_access_token),
             yahoo_refresh_token = VALUES(yahoo_refresh_token),
             yahoo_token_expires_at = VALUES(yahoo_token_expires_at)`,
            [access_token, refresh_token, expires_in]
        );  
    }

    async get(): Promise<Token> {
        const [rows] = await this.db.query<YahooDBToken[]>('SELECT yahoo_access_token, yahoo_refresh_token, yahoo_token_expires_at FROM tokens WHERE id = 1');
        
        if (!Array.isArray(rows) || rows.length === 0) {
            return { access_token: null, refresh_token: null, expires_in: null } as Token;
        }
        
        return {
            access_token: rows[0].yahoo_access_token,
            refresh_token: rows[0].yahoo_refresh_token,
            expires_in: rows[0].yahoo_token_expires_at
        } as Token;
    }
}

export default Token;