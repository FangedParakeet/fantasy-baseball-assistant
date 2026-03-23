import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { McpOAuth } from "../classes/mcpOAuth";
import { db } from "../db/db";

const router = express.Router();
const mcpOAuth = new McpOAuth(db);

/**
 * POST /api/oauth/token
 *
 * Supports two grant types (RFC 6749):
 *
 *   grant_type=client_credentials
 *     Required fields: client_id, client_secret
 *     Issues a fresh access + refresh token pair.
 *     Use this once to bootstrap credentials for an agent.
 *
 *   grant_type=refresh_token
 *     Required fields: refresh_token
 *     Rotates the token pair. The old refresh token is immediately invalidated.
 *
 * Request body may be JSON or application/x-www-form-urlencoded.
 */
router.post("/token", async (req: Request, res: Response) => {
	const { grant_type, client_id, client_secret, refresh_token } =
		req.body as Record<string, string>;

	if (!grant_type) {
		return res.status(400).json({
			error: "invalid_request",
			error_description: "grant_type is required",
		});
	}

	if (grant_type === "client_credentials") {
		const expectedClientId = process.env.MCP_CLIENT_ID;
		const expectedClientSecret = process.env.MCP_CLIENT_SECRET;

		if (!expectedClientId || !expectedClientSecret) {
			return res.status(500).json({
				error: "server_error",
				error_description: "MCP_CLIENT_ID / MCP_CLIENT_SECRET not configured",
			});
		}

		if (!client_id || !client_secret) {
			return res.status(400).json({
				error: "invalid_request",
				error_description: "client_id and client_secret are required",
			});
		}

		// Constant-time comparison to prevent timing attacks.
		const idMatch =
			client_id.length === expectedClientId.length &&
			timingSafeEqual(Buffer.from(client_id), Buffer.from(expectedClientId));
		const secretMatch =
			client_secret.length === expectedClientSecret.length &&
			timingSafeEqual(
				Buffer.from(client_secret),
				Buffer.from(expectedClientSecret),
			);

		if (!idMatch || !secretMatch) {
			return res.status(401).json({
				error: "invalid_client",
				error_description: "Invalid client credentials",
			});
		}

		const tokens = await mcpOAuth.issueTokens();
		return res.json(tokens);
	}

	if (grant_type === "refresh_token") {
		if (!refresh_token) {
			return res.status(400).json({
				error: "invalid_request",
				error_description: "refresh_token is required",
			});
		}

		const tokens = await mcpOAuth.refreshTokens(refresh_token);
		if (!tokens) {
			return res.status(401).json({
				error: "invalid_grant",
				error_description: "Refresh token is invalid or expired",
			});
		}

		return res.json(tokens);
	}

	return res.status(400).json({
		error: "unsupported_grant_type",
		error_description: `Unsupported grant_type: ${grant_type}`,
	});
});

export default router;
