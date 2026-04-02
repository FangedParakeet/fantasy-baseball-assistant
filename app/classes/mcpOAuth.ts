import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { QueryableDB } from "../db/db";

const AUTH_CODE_TTL_SECONDS = 600; // 10 minutes

const TABLE = "mcp_oauth_tokens";

// Access tokens expire in 1 hour; refresh tokens in 30 days.
const ACCESS_TOKEN_TTL_SECONDS = Number(
	process.env.MCP_ACCESS_TOKEN_TTL ?? 3600,
);
const REFRESH_TOKEN_TTL_SECONDS = Number(
	process.env.MCP_REFRESH_TOKEN_TTL ?? 60 * 60 * 24 * 30,
);

interface AuthCodeRow extends RowDataPacket {
	code: string;
	client_id: string;
	redirect_uri: string;
	code_challenge: string | null;
	code_challenge_method: string | null;
	expires_at: Date;
	used: number;
}

interface TokenRow extends RowDataPacket {
	id: number;
	access_token: string;
	refresh_token: string;
	access_token_expires_at: Date;
	refresh_token_expires_at: Date;
}

export type TokenResponse = {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token: string;
	scope?: string;
};

function generateToken(): string {
	return crypto.randomBytes(32).toString("hex");
}

function addSeconds(date: Date, seconds: number): Date {
	return new Date(date.getTime() + seconds * 1000);
}

function toMySQLDatetime(date: Date): string {
	return date.toISOString().slice(0, 19).replace("T", " ");
}

export class McpOAuth {
	constructor(private readonly db: QueryableDB) {}

	/** Create a one-time authorization code for the authorization code flow. */
	async createAuthCode(
		clientId: string,
		redirectUri: string,
		codeChallenge?: string,
		codeChallengeMethod?: string,
	): Promise<string> {
		const code = generateToken();
		const expires = addSeconds(new Date(), AUTH_CODE_TTL_SECONDS);

		await this.db.query(
			`INSERT INTO mcp_auth_codes
				(code, client_id, redirect_uri, code_challenge, code_challenge_method, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[code, clientId, redirectUri, codeChallenge ?? null, codeChallengeMethod ?? null, toMySQLDatetime(expires)],
		);

		return code;
	}

	/**
	 * Validate and consume an authorization code, returning tokens.
	 * Verifies PKCE code_verifier if the code was issued with a code_challenge.
	 */
	async exchangeAuthCode(
		code: string,
		clientId: string,
		redirectUri: string,
		codeVerifier?: string,
		scope?: string,
	): Promise<TokenResponse | null> {
		const [rows] = await this.db.query<AuthCodeRow[]>(
			`SELECT * FROM mcp_auth_codes
			 WHERE code = ? AND client_id = ? AND used = 0 AND expires_at > NOW()`,
			[code, clientId],
		);

		if (!Array.isArray(rows) || rows.length === 0) return null;

		const row = rows[0];

		if (row.redirect_uri !== redirectUri) return null;

		// Verify PKCE if the code was issued with a challenge.
		if (row.code_challenge) {
			if (!codeVerifier) return null;
			const method = row.code_challenge_method ?? "S256";
			let challenge: string;
			if (method === "S256") {
				challenge = crypto
					.createHash("sha256")
					.update(codeVerifier)
					.digest("base64url");
			} else {
				challenge = codeVerifier; // plain
			}
			if (challenge !== row.code_challenge) return null;
		}

		// Mark the code as used.
		await this.db.query(`UPDATE mcp_auth_codes SET used = 1 WHERE code = ?`, [code]);

		return this.issueTokens(scope);
	}

	/** Issue a new access + refresh token pair, replacing any existing tokens. */
	async issueTokens(scope?: string): Promise<TokenResponse> {
		const now = new Date();
		const accessToken = generateToken();
		const refreshToken = generateToken();
		const accessExpires = addSeconds(now, ACCESS_TOKEN_TTL_SECONDS);
		const refreshExpires = addSeconds(now, REFRESH_TOKEN_TTL_SECONDS);

		await this.db.query(
			`INSERT INTO ${TABLE}
               (id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at)
             VALUES (1, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               access_token = VALUES(access_token),
               refresh_token = VALUES(refresh_token),
               access_token_expires_at = VALUES(access_token_expires_at),
               refresh_token_expires_at = VALUES(refresh_token_expires_at)`,
			[
				accessToken,
				refreshToken,
				toMySQLDatetime(accessExpires),
				toMySQLDatetime(refreshExpires),
			],
		);

		return {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
			...(scope && { scope }),
		};
	}

	/** Validate a refresh token and issue a new token pair (rotation). */
	async refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
		const [rows] = await this.db.query<TokenRow[]>(
			`SELECT * FROM ${TABLE}
             WHERE id = 1
               AND refresh_token = ?
               AND refresh_token_expires_at > NOW()`,
			[refreshToken],
		);

		if (!Array.isArray(rows) || rows.length === 0) {
			return null;
		}

		return this.issueTokens();
	}

	/** Returns true if the access token exists and has not expired. */
	async validateAccessToken(accessToken: string): Promise<boolean> {
		const [rows] = await this.db.query<TokenRow[]>(
			`SELECT id FROM ${TABLE}
             WHERE id = 1
               AND access_token = ?
               AND access_token_expires_at > NOW()`,
			[accessToken],
		);

		return Array.isArray(rows) && rows.length > 0;
	}
}
