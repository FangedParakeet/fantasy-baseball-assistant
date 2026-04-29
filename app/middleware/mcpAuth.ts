import type { NextFunction, Request, Response } from "express";
import { McpOAuth } from "../classes/mcpOAuth";
import { db } from "../db/db";

const mcpOAuth = new McpOAuth(db);

const WWW_AUTHENTICATE = `Bearer resource_metadata="https://${process.env.SITE_DOMAIN}/.well-known/oauth-protected-resource"`;

export async function mcpAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		res.set("WWW-Authenticate", WWW_AUTHENTICATE);
		res.status(401).json({
			error: "invalid_token",
			error_description:
				"Missing or malformed Authorization header. Expected: Bearer <access_token>",
		});
		return;
	}

	const token = authHeader.slice(7);
	const valid = await mcpOAuth.validateAccessToken(token);
	if (!valid) {
		res.set("WWW-Authenticate", WWW_AUTHENTICATE);
		res.status(401).json({
			error: "invalid_token",
			error_description:
				"Access token is invalid or expired. Use POST /api/oauth/token with grant_type=refresh_token to obtain a new one.",
		});
		return;
	}

	next();
}
