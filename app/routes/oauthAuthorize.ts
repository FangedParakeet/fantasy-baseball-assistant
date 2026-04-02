import express, { type Request, type Response } from "express";
import { McpOAuth } from "../classes/mcpOAuth";
import { db } from "../db/db";

const router = express.Router();
const mcpOAuth = new McpOAuth(db);

/**
 * GET /oauth/authorize
 *
 * Authorization endpoint for the OAuth 2.0 authorization code flow (RFC 6749 §4.1).
 * Credal (or any MCP client) redirects the user here. We show a simple approval
 * page; on approval we issue an auth code and redirect back to the client.
 */
router.get("/", (req: Request, res: Response) => {
	const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method } =
		req.query as Record<string, string>;

	if (response_type !== "code") {
		return res.status(400).send("unsupported_response_type");
	}
	if (!client_id || !redirect_uri) {
		return res.status(400).send("invalid_request: client_id and redirect_uri are required");
	}

	const params = new URLSearchParams({
		client_id,
		redirect_uri,
		...(state && { state }),
		...(code_challenge && { code_challenge }),
		...(code_challenge_method && { code_challenge_method }),
	});

	res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — Fantasy Baseball Assistant</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; border-radius: 12px; padding: 2rem; max-width: 400px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.1); text-align: center; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .client { font-weight: 600; color: #111; }
    button { padding: 0.65rem 1.5rem; border-radius: 8px; border: none; cursor: pointer; font-size: 1rem; }
    .approve { background: #2563eb; color: white; margin-right: 0.5rem; }
    .deny { background: #e5e7eb; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize Access</h1>
    <p><span class="client">${client_id}</span> is requesting access to your Fantasy Baseball Assistant.</p>
    <form method="POST" action="/oauth/authorize?${params.toString()}">
      <button class="approve" type="submit" name="action" value="approve">Approve</button>
      <button class="deny" type="submit" name="action" value="deny">Deny</button>
    </form>
  </div>
</body>
</html>`);
});

/**
 * POST /oauth/authorize
 *
 * Handles the user's approval/denial. On approval, issues an auth code and
 * redirects to redirect_uri. On denial, redirects with error=access_denied.
 */
router.post("/", async (req: Request, res: Response) => {
	const { client_id, redirect_uri, state, code_challenge, code_challenge_method } =
		req.query as Record<string, string>;
	const { action } = req.body as { action: string };

	if (!client_id || !redirect_uri) {
		return res.status(400).send("invalid_request");
	}

	const redirectUrl = new URL(redirect_uri);

	if (action !== "approve") {
		redirectUrl.searchParams.set("error", "access_denied");
		if (state) redirectUrl.searchParams.set("state", state);
		return res.redirect(redirectUrl.toString());
	}

	const code = await mcpOAuth.createAuthCode(
		client_id,
		redirect_uri,
		code_challenge,
		code_challenge_method,
	);

	redirectUrl.searchParams.set("code", code);
	if (state) redirectUrl.searchParams.set("state", state);
	res.redirect(redirectUrl.toString());
});

export default router;
