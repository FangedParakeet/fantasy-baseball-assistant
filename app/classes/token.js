const { db } = require('../db');

class Token {

    async status() {
        const [tokens] = await db.query('SELECT yahoo_access_token, yahoo_token_expires_at FROM tokens WHERE id = 1');
    
        if (tokens.length === 0) {
          return { hasToken: false };
        }
    
        const token = tokens[0];
        const hasValidToken = token.yahoo_access_token && 
                             token.yahoo_token_expires_at && 
                             new Date(token.yahoo_token_expires_at) > new Date();

        return {
            hasToken: !!token.yahoo_access_token,
            hasValidToken,
            expiresAt: token.yahoo_token_expires_at
        }
    }

    async set(tokens) {
        const { access_token, refresh_token, expires_in } = tokens;

        // Store tokens in database (upsert)
        await db.query(
            `INSERT INTO tokens (id, yahoo_access_token, yahoo_refresh_token, yahoo_token_expires_at) 
             VALUES (1, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE 
             yahoo_access_token = VALUES(yahoo_access_token),
             yahoo_refresh_token = VALUES(yahoo_refresh_token),
             yahoo_token_expires_at = VALUES(yahoo_token_expires_at)`,
            [access_token, refresh_token, expires_in]
        );  
    }

    async get() {
        const [tokens] = await db.query('SELECT yahoo_access_token, yahoo_refresh_token, yahoo_token_expires_at FROM tokens WHERE id = 1');
        
        if (tokens.length === 0) {
            return {};
        }
        
        return {
            access_token: tokens[0].yahoo_access_token,
            refresh_token: tokens[0].yahoo_refresh_token,
            expires_at: tokens[0].yahoo_token_expires_at
        };
    }
}

module.exports = Token;