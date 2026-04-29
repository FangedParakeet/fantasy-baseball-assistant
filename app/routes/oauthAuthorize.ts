import express, { type Request, type Response } from "express";
import { McpOAuth } from "../classes/mcpOAuth";
import { db } from "../db/db";

const router = express.Router();
const mcpOAuth = new McpOAuth(db);

/**
 * GET /oauth/authorize
 *
 * Auto-approves all requests immediately. This is a personal single-user server,
 * and requiring manual approval causes Claude Desktop to time out and kill mcp-remote
 * before the callback can be received.
 *
 * mcp-remote binds its callback server to 127.0.0.1 (IPv4) but sends redirect_uri
 * with "localhost" which macOS browsers resolve to ::1 (IPv6). We rewrite to 127.0.0.1.
 */
router.get("/", async (req: Request, res: Response) => {
	const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method } =
		req.query as Record<string, string>;

	if (response_type !== "code") {
		return res.status(400).send("unsupported_response_type");
	}
	if (!client_id || !redirect_uri) {
		return res.status(400).send("invalid_request: client_id and redirect_uri are required");
	}

	const normalizedRedirectUri = redirect_uri.replace(/^(https?:\/\/)localhost(:\d+)/, '$1127.0.0.1$2');
	console.log(`[OAuth] authorize GET: auto-approving client_id=${client_id} redirect_uri=${normalizedRedirectUri}`);

	const code = await mcpOAuth.createAuthCode(
		client_id,
		normalizedRedirectUri,
		code_challenge,
		code_challenge_method,
	);

	const redirectUrl = new URL(normalizedRedirectUri);
	redirectUrl.searchParams.set("code", code);
	if (state) redirectUrl.searchParams.set("state", state);
	res.redirect(redirectUrl.toString());
});

export default router;
