import type { NextFunction, Request, Response } from "express";
import { McpOAuth } from "../classes/mcpOAuth";
import { db } from "../db/db";

const mcpOAuth = new McpOAuth(db);

/**
 * Identical to mcpAuth but intentionally omits the WWW-Authenticate header.
 * Used to test the OAuth fallback discovery path, where the client must
 * discover the authorization server by hitting /.well-known/ URLs directly
 * rather than following a WWW-Authenticate pointer.
 */
export async function mcpAuthNoHeader(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		res.status(401).json({
			error: "invalid_token",
			error_description: "Missing or malformed Authorization header. Expected: Bearer <access_token>",
		});
		return;
	}

	const token = authHeader.slice(7);
	const valid = await mcpOAuth.validateAccessToken(token);
	if (!valid) {
		res.status(401).json({
			error: "invalid_token",
			error_description: "Access token is invalid or expired.",
		});
		return;
	}

	next();
}
