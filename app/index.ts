import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { runMigrations } from './db/db';
import authRoutes from './routes/auth';
import rosterRoutes from './routes/roster';
import playerRoutes from './routes/player';
// import aiRoutes from './routes/ai';

const app = express();
app.use(cors({
	origin: true, // Allow all origins for debugging
	credentials: true,
}));
app.use(express.json());

// Simple request logging middleware
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
	next();
});

app.use('/api/auth', authRoutes);
app.use('/api', rosterRoutes);
// app.use('/api', aiRoutes);
app.use('/api', playerRoutes);

const PORT = Number(process.env.APP_PORT) || 3001;
app.listen(PORT, async () => {
	await runMigrations();
	console.log(`Server running on port ${PORT}`);
});
