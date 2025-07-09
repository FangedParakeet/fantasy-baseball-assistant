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
    is_c TINYINT(1) DEFAULT 0,
    is_1b TINYINT(1) DEFAULT 0,
    is_2b TINYINT(1) DEFAULT 0,
    is_3b TINYINT(1) DEFAULT 0,
    is_ss TINYINT(1) DEFAULT 0,
    is_of TINYINT(1) DEFAULT 0,
    is_util TINYINT(1) DEFAULT 0,
    is_sp TINYINT(1) DEFAULT 0,
    is_rp TINYINT(1) DEFAULT 0,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);

  // Create indexes for players table
  try {
    await db.query('CREATE INDEX idx_sp ON players (is_sp)');
  } catch (error) {
    // Index already exists, ignore error
    console.log('idx_sp index already exists');
  }

  try {
    await db.query('CREATE INDEX idx_rp ON players (is_rp)');
  } catch (error) {
    // Index already exists, ignore error
    console.log('idx_rp index already exists');
  }

  try {
    await db.query('CREATE INDEX idx_is_of ON players (is_of)');
  } catch (error) {
    // Index already exists, ignore error
    console.log('idx_is_of index already exists');
  }

  try {
    await db.query('CREATE INDEX idx_team_id ON players (team_id)');
  } catch (error) {
    // Index already exists, ignore error
    console.log('idx_team_id index already exists');
  }

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

  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_context (
      id INT AUTO_INCREMENT PRIMARY KEY,
      key_name VARCHAR(255) UNIQUE,
      content TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      id INT AUTO_INCREMENT PRIMARY KEY,
      key_name VARCHAR(255) UNIQUE,
      last_synced DATETIME
    )
  `);

  // Insert AI context data
  const aiContextData = [
    {
      key_name: 'daily_streamers',
      content: 'You are helping manage a fantasy baseball team. The scoring period starts on a Monday and lasts 7 days.\n\nYou will be given:\n- A list of starting pitchers that are currently rostered in the league.\n- Today\'s date (the Monday of the scoring period).\n\nYour job is to recommend **at least three** available starting pitchers to stream **each day** from Monday to Sunday. Prioritise pitchers most likely to earn **Quality Starts (QS)**, and also consider ERA, WHIP, and strikeouts. Do not recommend relievers.\n\nOnly recommend players who are **not in the list provided**, as they are assumed to be available. When uncertain about starts, use educated guesses based on recent rotations and matchups.\n\nReturn a table or bullet point list of at least 3 recommendations per day.'
    },
    {
      key_name: 'two_start_pitchers',
      content: 'You are recommending **two-start pitchers** to stream in a fantasy baseball league.\n\nYou will be provided:\n- The Monday date that begins the scoring period.\n- A list of starting pitchers that are **already rostered** in the league.\n\nUsing that list as a filter, recommend **at least five** two-start pitchers for the upcoming week (Monday–Sunday) **not on that list**. Prioritise Quality Start (QS) potential, ERA, WHIP, strikeouts, and matchup favourability.\n\nMake reasonable assumptions about team rotations to estimate two-start opportunities. Do not include relievers or openers.'
    },
    {
      key_name: 'positional_add_drop',
      content: 'You are helping with add/drop analysis in a fantasy baseball league.\n\nYou will be provided:\n- A scoring period start date\n- The player\'s team roster\n- The player\'s name (if doing a comparison)\n- The fantasy position to upgrade (e.g., 1B, OF, RP, SP)\n- A list of **rostered players** in the league (everyone not on this list is considered available)\n\nYour job is to:\n- Recommend **at least 5 available players** at that position not already on the rostered list.\n- Evaluate their potential to outperform either the specified team player (if given) or improve the team at the specified position.\n- For hitters, prioritise HR and SB upside. For pitchers, prioritise QS and SVH upside. Still consider other scoring categories (R, RBI, AVG, K, ERA, WHIP).\n- Say whether it would be smart to drop the current player to add any of the recommended ones.\n\nOnly recommend players not in the provided "already rostered" list.'
    },
    {
      key_name: 'opponent_analysis',
      content: 'You are analysing a fantasy baseball opponent\'s team for the upcoming 7-day scoring period.\n\nGiven an opponent\'s roster, identify:\n- Their strongest and weakest positions\n- Potential streaming opportunities they might exploit\n- Players who could have breakout weeks\n- Matchup advantages/disadvantages\n\nProvide actionable insights for setting your lineup against this opponent.'
    }
  ];

  for (const context of aiContextData) {
    await db.query(
      'INSERT INTO ai_context (key_name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
      [context.key_name, context.content]
    );
  }

  // Add unique constraint to yahoo_team_id in teams table
  try {
    await db.query('ALTER TABLE teams ADD UNIQUE (yahoo_team_id)');
  } catch (error) {
    // Constraint already exists, ignore error
    console.log('Unique constraint on yahoo_team_id already exists');
  }
}

module.exports = { db, runMigrations };