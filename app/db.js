const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fantasy_baseball',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function runMigrations() {
  await db.query(`CREATE TABLE IF NOT EXISTS tokens (
    id INT PRIMARY KEY DEFAULT 1,
    yahoo_access_token VARCHAR(1000),
    yahoo_refresh_token VARCHAR(1000),
    yahoo_token_expires_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    yahoo_team_id VARCHAR(50) NOT NULL,
    team_name VARCHAR(100) NOT NULL,
    is_user_team BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    yahoo_player_id VARCHAR(50),
    team_id INT,
    name VARCHAR(100) NOT NULL,
    mlb_team VARCHAR(10),
    positions VARCHAR(50),
    status ENUM('rostered', 'free_agent') DEFAULT 'rostered',
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);

  // Add new columns if they don't exist
  try {
    await db.query(`ALTER TABLE players ADD COLUMN eligible_positions TEXT`);
  } catch (error) {
    // Column already exists, ignore error
    console.log('eligible_positions column already exists');
  }

  try {
    await db.query(`ALTER TABLE players ADD COLUMN selected_position VARCHAR(50)`);
  } catch (error) {
    // Column already exists, ignore error
    console.log('selected_position column already exists');
  }

  try {
    await db.query(`ALTER TABLE players ADD COLUMN headshot_url VARCHAR(500)`);
  } catch (error) {
    // Column already exists, ignore error
    console.log('headshot_url column already exists');
  }

  await db.query(`CREATE TABLE IF NOT EXISTS recommendations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    alt_player_name VARCHAR(100),
    alt_positions VARCHAR(50),
    description TEXT,
    rating INT CHECK (rating >= 0 AND rating <= 100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  )`);
}

module.exports = { db, runMigrations };