import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { createMcpServer } from "../mcp/server";
import { mcpAuth } from "../middleware/mcpAuth";

const router = express.Router();

// Stateless Streamable HTTP — a fresh server+transport is created per request.
// This avoids session state complexity and is appropriate for agent use.
router.post("/", mcpAuth, async (req: Request, res: Response) => {
	try {
		const server = createMcpServer();
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined, // stateless mode
		});

		res.on("close", () => {
			transport.close();
			server.close();
		});

		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	} catch (error) {
		console.error("[MCP] Error handling request:", error);
		if (!res.headersSent) {
			res.status(500).json({ error: "Internal MCP server error" });
		}
	}
});

// MCP clients may send GET/DELETE for session management — return 405 for stateless setup.
router.get("/", (_req: Request, res: Response) => {
	res.status(405).json({
		error: "This MCP server uses stateless HTTP. Only POST is supported.",
	});
});

export default router;
