const express = require('express');
const cors = require('cors');
const session = require('express-session');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: true }));

// Placeholder route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Fantasy Baseball Assistant backend is running.' });
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
