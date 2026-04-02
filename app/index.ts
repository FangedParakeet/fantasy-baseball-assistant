// biome-ignore assist/source/organizeImports: biome is busted
import cors from "cors";
import "dotenv/config";
import express from "express";
import { runMigrations } from "./db/db";
import authRoutes from "./routes/auth";
import { draftLiveRoutes } from "./routes/draftLive";
import draftSettingsRoutes from "./routes/draftSettings";
import leagueRoutes from "./routes/league";
import mcpRoutes from "./routes/mcp";
import oauthRoutes from "./routes/oauth";
import oauthAuthorizeRoutes from "./routes/oauthAuthorize";
import playerRoutes from "./routes/player";
import rosterRoutes from "./routes/roster";
// import aiRoutes from './routes/ai';

const app = express();
app.use(cors({
	origin: true, // Allow all origins for debugging
	credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple request logging middleware
app.use((req, _, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
	next();
});

// OAuth 2.0 discovery endpoints (RFC 8414 / RFC 8707)
// Required by MCP clients (e.g. Claude Code) to discover the token endpoint.
const baseUrl = `https://${process.env.SITE_DOMAIN}`;
app.get('/.well-known/oauth-authorization-server', (_, res) => {
	res.json({
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/oauth/authorize`,
		token_endpoint: `${baseUrl}/api/oauth/token`,
		registration_endpoint: `${baseUrl}/api/oauth/register`,
		grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
		response_types_supported: ['code'],
		code_challenge_methods_supported: ['S256', 'plain'],
	});
});
app.get('/.well-known/oauth-protected-resource', (_, res) => {
	res.json({
		resource: `${baseUrl}/api/mcp`,
		authorization_servers: [baseUrl],
	});
});

app.use('/api/auth', authRoutes);
app.use('/api', rosterRoutes);
// app.use('/api', aiRoutes);
app.use('/api', playerRoutes);
app.use('/api/league', leagueRoutes);
app.use('/api/draft/settings', draftSettingsRoutes);
app.use('/api/draft/live', draftLiveRoutes);
app.use('/oauth/authorize', oauthAuthorizeRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/mcp', mcpRoutes);

const PORT = Number(process.env.APP_PORT) || 3001;
app.listen(PORT, async () => {
	await runMigrations();
	console.log(`Server running on port ${PORT}`);
});
