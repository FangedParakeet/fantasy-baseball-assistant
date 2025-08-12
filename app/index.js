const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { runMigrations } = require('./db');
const authRoutes = require('./routes/auth');
const rosterRoutes = require('./routes/roster');
const aiRoutes = require('./routes/ai');

const app = express();
app.use(cors({
  origin: true, // Allow all origins for debugging
  credentials: true
}));
app.use(express.json());

// Simple request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api', rosterRoutes);
app.use('/api', aiRoutes);

const PORT = process.env.APP_PORT || 3001;
app.listen(PORT, async () => {
  await runMigrations();
  console.log(`Server running on port ${PORT}`);
});
