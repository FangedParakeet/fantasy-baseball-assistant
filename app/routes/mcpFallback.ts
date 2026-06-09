import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { mcpAuthNoHeader } from "../middleware/mcpAuthNoHeader";
import { createMcpServer } from "../mcp/server";

const router = express.Router();

/**
 * Fallback OAuth discovery test endpoint.
 * Returns 401 without WWW-Authenticate, forcing the client to discover
 * the authorization server via /.well-known/ URLs at the origin directly.
 */
router.post("/", mcpAuthNoHeader, async (req: Request, res: Response) => {
	try {
		const server = createMcpServer();
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});

		res.on("close", () => {
			transport.close();
			server.close();
		});

		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	} catch (error) {
		console.error("[MCP Fallback] Error handling request:", error);
		if (!res.headersSent) {
			res.status(500).json({ error: "Internal MCP server error" });
		}
	}
});

router.get("/", mcpAuthNoHeader, (req: Request, res: Response) => {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.flushHeaders();
	req.on("close", () => res.end());
});

export default router;
