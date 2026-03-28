import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { QueryableDB } from "../db/db";

const TABLE = "mcp_oauth_tokens";

// Access tokens expire in 1 hour; refresh tokens in 30 days.
const ACCESS_TOKEN_TTL_SECONDS = Number(
	process.env.MCP_ACCESS_TOKEN_TTL ?? 3600,
);
const REFRESH_TOKEN_TTL_SECONDS = Number(
	process.env.MCP_REFRESH_TOKEN_TTL ?? 60 * 60 * 24 * 30,
);

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

	/** Issue a new access + refresh token pair, replacing any existing tokens. */
	async issueTokens(): Promise<TokenResponse> {
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
