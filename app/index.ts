// biome-ignore assist/source/organizeImports: biome is busted
import cors from "cors";
import "dotenv/config";
import express from "express";
import { runMigrations } from "./db/db";
import authRoutes from "./routes/auth";
import { draftLiveRoutes } from "./routes/draftLive";
import draftSettingsRoutes from "./routes/draftSettings";
import leagueRoutes from "./routes/league";
import playerRoutes from "./routes/player";
import rosterRoutes from "./routes/roster";
// import aiRoutes from './routes/ai';

const app = express();
app.use(cors({
	origin: true, // Allow all origins for debugging
	credentials: true,
}));
app.use(express.json());

// Simple request logging middleware
app.use((req, _, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
	next();
});

app.use('/api/auth', authRoutes);
app.use('/api', rosterRoutes);
// app.use('/api', aiRoutes);
app.use('/api', playerRoutes);
app.use('/api/league', leagueRoutes);
app.use('/api/draft/settings', draftSettingsRoutes);
app.use('/api/draft/live', draftLiveRoutes);

const PORT = Number(process.env.APP_PORT) || 3001;
app.listen(PORT, async () => {
	await runMigrations();
	console.log(`Server running on port ${PORT}`);
});
