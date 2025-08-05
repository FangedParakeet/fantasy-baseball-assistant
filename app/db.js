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
    yahoo_team_id VARCHAR(50) NOT NULL UNIQUE,
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
    eligible_positions TEXT,
    selected_position VARCHAR(50),
    headshot_url VARCHAR(500),
    normalised_name VARCHAR(100),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    INDEX idx_sp (is_sp),
    INDEX idx_rp (is_rp),
    INDEX idx_is_of (is_of),
    INDEX idx_team_id (team_id),
    INDEX idx_normalised_name_ps (normalised_name)
  )`);

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

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      stat_period ENUM('season', '7d', '14d', '28d') NOT NULL,
      games INT,
      avg FLOAT,
      obp FLOAT,
      slg FLOAT,
      ops FLOAT,
      hr INT,
      r INT,
      rbi INT,
      sb INT,
      k INT,
      bb INT,
      era FLOAT,
      whip FLOAT,
      qs INT,
      ip FLOAT,
      sv INT,
      hld INT,
      bats CHAR(1),
      throws CHAR(1),
      sf INT DEFAULT 0,
      normalised_name VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      UNIQUE KEY unique_player_period (player_id, stat_period),
      INDEX idx_normalised_name_ps (normalised_name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_stats_advanced (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      stat_period ENUM('season', '7d', '14d', '28d') NOT NULL,
      babip FLOAT,
      fip FLOAT,
      era_minus FLOAT,
      woba FLOAT,
      wrc_plus FLOAT,
      k_perc FLOAT,
      bb_perc FLOAT,
      hr_per_9 FLOAT,
      qs_perc FLOAT,
      normalised_name VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      UNIQUE KEY unique_player_period (player_id, stat_period),
      INDEX idx_normalised_name_ps_advanced (normalised_name)
    )
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_abbr VARCHAR(10) NOT NULL,
      period_days INT NOT NULL,
      vs_hand ENUM('LHP', 'RHP') DEFAULT NULL,
      is_home BOOLEAN DEFAULT NULL,
      games INT,
      runs_scored INT,
      runs_allowed INT,
      avg FLOAT,
      obp FLOAT,
      slg FLOAT,
      ops FLOAT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_team_stat (team_abbr, period_days, vs_hand, is_home)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_game_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      game_date DATE NOT NULL,
      opponent VARCHAR(10),
      is_home BOOLEAN,
      position VARCHAR(10),
      ab INT,
      h INT,
      r INT,
      rbi INT,
      hr INT,
      sb INT,
      bb INT,
      k INT,
      ip FLOAT,
      er INT,
      hits_allowed INT,
      walks_allowed INT,
      strikeouts INT,
      qs BOOLEAN,
      sv BOOLEAN,
      hld BOOLEAN,
      fantasy_points FLOAT,
      team VARCHAR(10),
      game_id VARCHAR(20),
      normalised_name VARCHAR(100),

      -- Advanced Statistics

      singles INT DEFAULT 0,
      doubles INT DEFAULT 0,
      triples INT DEFAULT 0,
      total_bases INT DEFAULT 0,
      sac_flies INT DEFAULT 0,
      hit_by_pitch INT DEFAULT 0,
      ground_outs INT DEFAULT 0,
      air_outs INT DEFAULT 0,
      left_on_base INT DEFAULT 0,
      ground_into_dp INT DEFAULT 0,
      batters_faced INT DEFAULT 0,
      wild_pitches INT DEFAULT 0,
      balks INT DEFAULT 0,
      home_runs_allowed INT DEFAULT 0,
      inherited_runners INT DEFAULT 0,
      inherited_runners_scored INT DEFAULT 0,
      UNIQUE KEY unique_player_game (player_id, game_date),
      INDEX idx_normalised_name_ps_logs (normalised_name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_rolling_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      span_days INT NOT NULL,
      split_type VARCHAR(10) DEFAULT 'overall',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      games INT DEFAULT 0,
      rbi INT DEFAULT 0,
      runs INT DEFAULT 0,
      hr INT DEFAULT 0,
      sb INT DEFAULT 0,
      hits INT DEFAULT 0,
      abs INT DEFAULT 0,
      avg DECIMAL(4,3) DEFAULT 0.000,
      k INT DEFAULT 0,
      strikeouts INT DEFAULT 0,
      ip DECIMAL(5,2) DEFAULT 0.00,
      er INT DEFAULT 0,
      qs INT DEFAULT 0,
      sv INT DEFAULT 0,
      hld INT DEFAULT 0,
      whip DECIMAL(4,2) DEFAULT 0.00,
      era DECIMAL(5,2) DEFAULT 0.00,
      normalised_name VARCHAR(100),
      position VARCHAR(10),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_player_span (player_id, span_days, split_type),
      INDEX idx_normalised_name_ts (normalised_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_rolling_stats_percentiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      span_days INT NOT NULL,
      split_type VARCHAR(10) NOT NULL,
      rbi_pct DECIMAL(5,2) DEFAULT 0.00,
      runs_pct DECIMAL(5,2) DEFAULT 0.00,
      hr_pct DECIMAL(5,2) DEFAULT 0.00,
      sb_pct DECIMAL(5,2) DEFAULT 0.00,
      hits_pct DECIMAL(5,2) DEFAULT 0.00,
      avg_pct DECIMAL(5,2) DEFAULT 0.00,
      k_pct DECIMAL(5,2) DEFAULT 0.00,
      strikeouts_pct DECIMAL(5,2) DEFAULT 0.00,
      era_pct DECIMAL(5,2) DEFAULT 0.00,
      whip_pct DECIMAL(5,2) DEFAULT 0.00,
      er_pct DECIMAL(5,2) DEFAULT 0.00,
      qs_pct DECIMAL(5,2) DEFAULT 0.00,
      sv_pct DECIMAL(5,2) DEFAULT 0.00,
      hld_pct DECIMAL(5,2) DEFAULT 0.00,
      reliability_score TINYINT UNSIGNED DEFAULT 0,
      is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
      normalised_name VARCHAR(100),
      position VARCHAR(10),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_player_span (player_id, span_days, split_type),
      INDEX idx_normalised_name_ps_percentiles (normalised_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_advanced_rolling_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      span_days INT NOT NULL,
      split_type VARCHAR(10) DEFAULT 'overall',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,

      -- Advanced Batting
      obp DECIMAL(4,3) DEFAULT 0.000,
      slg DECIMAL(4,3) DEFAULT 0.000,
      ops DECIMAL(4,3) DEFAULT 0.000,
      bb_rate DECIMAL(5,2) DEFAULT 0.00,
      k_rate DECIMAL(5,2) DEFAULT 0.00,
      babip DECIMAL(5,3) DEFAULT 0.000,
      iso DECIMAL(4,3) DEFAULT 0.000,
      contact_pct DECIMAL(5,2) DEFAULT 0.00,
      gb_fb_ratio DECIMAL(4,3) DEFAULT 0.000,
      lob_batting_pct DECIMAL(5,2) DEFAULT 0.00,
      woba DECIMAL(4,3) DEFAULT 0.000,
      woba_plus DECIMAL(5,1) DEFAULT 0.0,
      obp_plus DECIMAL(5,1) DEFAULT 0.0,
      slg_plus DECIMAL(5,1) DEFAULT 0.0,
      ops_plus DECIMAL(5,1) DEFAULT 0.0,
      wraa DECIMAL(5,1) DEFAULT 0.0,

      -- Advanced Pitching
      inherited_runners INT DEFAULT 0,
      inherited_runners_scored INT DEFAULT 0,
      irs_pct DECIMAL(5,2) DEFAULT 0.00,
      fip DECIMAL(5,2) DEFAULT 0.00,
      k_per_9 DECIMAL(5,2) DEFAULT 0.00,
      bb_per_9 DECIMAL(5,2) DEFAULT 0.00,
      hr_per_9 DECIMAL(5,2) DEFAULT 0.00,
      k_bb_ratio DECIMAL(5,2) DEFAULT 0.00,
      lob_pitching_pct DECIMAL(5,2) DEFAULT 0.00,
      fip_minus DECIMAL(5,1) DEFAULT 0.0,
      era_minus DECIMAL(6,1) DEFAULT 0.0,

      -- Meta
      normalised_name VARCHAR(100),
      position VARCHAR(10),
      abs INT DEFAULT 0,
      ip DECIMAL(5,2) DEFAULT 0.00,
      games INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      UNIQUE KEY unique_player_span (player_id, span_days, split_type),
      INDEX idx_normalised_name_ars (normalised_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_advanced_rolling_stats_percentiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      span_days INT NOT NULL,
      split_type VARCHAR(10) NOT NULL,

      -- Advanced Batting
      obp_pct DECIMAL(5,2) DEFAULT 0.00,
      slg_pct DECIMAL(5,2) DEFAULT 0.00,
      ops_pct DECIMAL(5,2) DEFAULT 0.00,
      bb_rate_pct DECIMAL(5,2) DEFAULT 0.00,
      k_rate_pct DECIMAL(5,2) DEFAULT 0.00,
      babip_pct DECIMAL(5,2) DEFAULT 0.00,
      iso_pct DECIMAL(5,2) DEFAULT 0.00,
      contact_pct_pct DECIMAL(5,2) DEFAULT 0.00,
      gb_fb_ratio_pct DECIMAL(5,2) DEFAULT 0.00,
      lob_batting_pct_pct DECIMAL(5,2) DEFAULT 0.00,
      woba_pct DECIMAL(5,2) DEFAULT 0.00,
      woba_plus_pct DECIMAL(5,2) DEFAULT 0.00,
      obp_plus_pct DECIMAL(5,2) DEFAULT 0.00,
      slg_plus_pct DECIMAL(5,2) DEFAULT 0.00,
      ops_plus_pct DECIMAL(5,2) DEFAULT 0.00,
      wraa_pct DECIMAL(5,2) DEFAULT 0.00,

      -- Advanced Pitching
      inherited_runners_pct DECIMAL(5,2) DEFAULT 0.00,
      inherited_runners_scored_pct DECIMAL(5,2) DEFAULT 0.00,
      irs_pct_pct DECIMAL(5,2) DEFAULT 0.00,
      fip_pct DECIMAL(5,2) DEFAULT 0.00,
      k_per_9_pct DECIMAL(5,2) DEFAULT 0.00,
      bb_per_9_pct DECIMAL(5,2) DEFAULT 0.00,
      hr_per_9_pct DECIMAL(5,2) DEFAULT 0.00,
      k_bb_ratio_pct DECIMAL(5,2) DEFAULT 0.00,
      lob_pitching_pct_pct DECIMAL(5,2) DEFAULT 0.00,
      fip_minus_pct DECIMAL(5,2) DEFAULT 0.00,
      era_minus_pct DECIMAL(5,2) DEFAULT 0.00,

      -- Meta
      reliability_score TINYINT UNSIGNED,
      is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
      normalised_name VARCHAR(100),
      position VARCHAR(10),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      UNIQUE KEY unique_player_span (player_id, span_days, split_type),
      INDEX idx_normalised_name_ars_percentiles (normalised_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_game_logs (
      team VARCHAR(10),
      game_date DATE,
      opponent VARCHAR(10),
      is_home BOOLEAN,
      is_win BOOLEAN,
      runs_scored INT,
      runs_allowed INT,
      avg FLOAT,
      obp FLOAT,
      slg FLOAT,
      ops FLOAT,
      er INT,
      era FLOAT,
      whip FLOAT,
      strikeouts INT,
      walks INT,
      ip FLOAT,
      hits_allowed INT,
      game_id VARCHAR(20),

      -- Advanced Statistics

      singles INT DEFAULT 0,
      doubles INT DEFAULT 0,
      triples INT DEFAULT 0,
      total_bases INT DEFAULT 0,
      sac_flies INT DEFAULT 0,
      hit_by_pitch INT DEFAULT 0,
      ground_outs INT DEFAULT 0,
      air_outs INT DEFAULT 0,
      left_on_base INT DEFAULT 0,
      ground_into_dp INT DEFAULT 0,
      batters_faced INT DEFAULT 0,
      wild_pitches INT DEFAULT 0,
      balks INT DEFAULT 0,
      home_runs_allowed INT DEFAULT 0,
      inherited_runners INT DEFAULT 0,
      inherited_runners_scored INT DEFAULT 0,
      PRIMARY KEY (team, game_date)
    )
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_rolling_stats (
      team VARCHAR(10),
      split_type VARCHAR(10),
      span_days INT,
      games_played INT,

      -- Basic scoring
      runs_scored INT,
      runs_allowed INT,
      run_diff INT,
      avg_runs_scored DECIMAL(4,2),
      avg_runs_allowed DECIMAL(4,2),

      -- Rate stats
      avg FLOAT,
      obp FLOAT,
      slg FLOAT,
      ops FLOAT,

      -- Pitching/defence
      er INT,
      era FLOAT,
      whip FLOAT,
      strikeouts INT,
      walks INT,
      ip FLOAT,
      hits_allowed INT,

      -- Advanced aggregates
      singles INT,
      doubles INT,
      triples INT,
      total_bases INT,
      sac_flies INT,
      hit_by_pitch INT,
      ground_outs INT,
      air_outs INT,
      left_on_base INT,
      ground_into_dp INT,
      batters_faced INT,
      wild_pitches INT,
      balks INT,
      home_runs_allowed INT,
      inherited_runners INT,
      inherited_runners_scored INT,

      -- Derived advanced metrics
      babip DECIMAL(5,3),
      lob_pct DECIMAL(5,2),
      fip DECIMAL(5,2),
      k_per_9 DECIMAL(5,2),
      bb_per_9 DECIMAL(5,2),
      hr_per_9 DECIMAL(5,2),
      k_bb_ratio DECIMAL(5,2),

      PRIMARY KEY (team, split_type, span_days)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_rolling_stats_percentiles (
      team VARCHAR(10),
      split_type VARCHAR(10),
      span_days INT,

      -- Basic scoring
      avg_runs_scored_pct DECIMAL(5,2),
      avg_runs_allowed_pct DECIMAL(5,2),

      -- Rate stats
      avg_pct DECIMAL(5,2),
      obp_pct DECIMAL(5,2),
      slg_pct DECIMAL(5,2),
      ops_pct DECIMAL(5,2),

      -- Pitching/defence
      era_pct DECIMAL(5,2),
      whip_pct DECIMAL(5,2),

      -- Advanced aggregates

      -- Derived advanced metrics
      fip_pct DECIMAL(5,2),
      k_per_9_pct DECIMAL(5,2),
      bb_per_9_pct DECIMAL(5,2),
      hr_per_9_pct DECIMAL(5,2),
      k_bb_ratio_pct DECIMAL(5,2),

      -- Meta
      reliability_score TINYINT UNSIGNED,
      is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (team, split_type, span_days)
    );
  `);


  await db.query(`
    CREATE TABLE team_vs_batter_splits (
        team VARCHAR(10),
        bats CHAR(1),
        span_days INT,
        start_date DATE,
        end_date DATE,
        games_played INT,

        -- Basic Statistics
        ab INT,
        hits INT,
        doubles INT,
        triples INT,
        hr INT,
        rbi INT,
        runs INT,
        sb INT,
        bb INT,
        k INT,
        sac_flies INT,
        hbp INT,
        ground_into_dp INT,

        -- Advanced Statistics
        avg DECIMAL(4,3),
        obp DECIMAL(4,3),
        slg DECIMAL(5,3),
        ops DECIMAL(5,3),
        so_rate DECIMAL(5,2),
        bb_rate DECIMAL(5,2),

        PRIMARY KEY (team, bats, span_days)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_vs_batter_splits_percentiles (
      team VARCHAR(10),
      bats CHAR(1),
      span_days INT,
      ops_pct DECIMAL(5,2),
      so_rate_pct DECIMAL(5,2),
      bb_rate_pct DECIMAL(5,2),

      -- Meta
      reliability_score TINYINT UNSIGNED,
      is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (team, bats, span_days)
    );
  `);


  await db.query(`
    CREATE TABLE team_vs_pitcher_splits (
        team VARCHAR(10),
        throws CHAR(1),
        span_days INT,
        start_date DATE,
        end_date DATE,
        games_played INT,

        -- Basic Statistics
        ab INT,
        hits INT,
        doubles INT,
        triples INT,
        hr INT,
        rbi INT,
        runs INT,
        sb INT,
        bb INT,
        k INT,
        sac_flies INT,
        hbp INT,
        ground_into_dp INT,

        -- Advanced Statistics
        avg DECIMAL(4,3),
        obp DECIMAL(4,3),
        slg DECIMAL(5,3),
        ops DECIMAL(5,3),
        so_rate DECIMAL(5,2),
        bb_rate DECIMAL(5,2),

        PRIMARY KEY (team, throws, span_days)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_vs_pitcher_splits_percentiles (
      team VARCHAR(10),
      throws CHAR(1),
      span_days INT,
      ops_pct DECIMAL(5,2),
      so_rate_pct DECIMAL(5,2),
      bb_rate_pct DECIMAL(5,2),

      -- Meta
      reliability_score TINYINT UNSIGNED,
      is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (team, throws, span_days)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_rolling_stats (
      entity_type ENUM('player', 'team', 'team_vs_batter', 'team_vs_pitcher') NOT NULL,
      split_type VARCHAR(10),
      span_days INT,

      -- Basic stats
      avg FLOAT,
      obp FLOAT,
      slg FLOAT,
      ops FLOAT,

      -- Fantasy-friendly
      hr_per_game FLOAT,
      sb_per_game FLOAT,
      rbi_per_game FLOAT,
      runs_per_game FLOAT,
      k_per_game FLOAT,
      bb_per_game FLOAT,

      -- Pitching
      whip FLOAT,
      era FLOAT,
      fip FLOAT,
      qs_rate FLOAT,

      -- Meta
      entity_count INT,
      PRIMARY KEY (entity_type, split_type, span_days)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_advanced_rolling_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      span_days INT NOT NULL,
      split_type VARCHAR(10) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      obp DECIMAL(4,3),
      slg DECIMAL(4,3),
      ops DECIMAL(4,3),
      woba DECIMAL(4,3),
      fip DECIMAL(5,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_league_rolling (span_days, split_type),
      INDEX idx_league_split_window (split_type, span_days)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS probable_pitchers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      espn_game_id VARCHAR(50) NOT NULL,
      game_date DATE NOT NULL,
      team VARCHAR(5) NOT NULL,
      opponent VARCHAR(5) NOT NULL,
      espn_pitcher_id INT,
      player_id INT,
      pitcher_name VARCHAR(100),
      home BOOLEAN,
      normalised_name VARCHAR(100),
      UNIQUE KEY unique_game_team (espn_game_id, team),
      INDEX idx_normalised_name_pp (normalised_name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sync_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sync_name VARCHAR(100) UNIQUE,
      status ENUM('pending', 'success', 'error') DEFAULT 'pending',
      message TEXT,
      last_run DATETIME,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_lookup (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL UNIQUE,
      espn_player_id INT,
      normalised_name VARCHAR(100) NOT NULL,
      first_name VARCHAR(50),
      last_name VARCHAR(50),
      team VARCHAR(10),
      bats CHAR(1),
      throws CHAR(1),
      status VARCHAR(50),
      last_updated DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_player_id (player_id),
      INDEX idx_espn_player_id (espn_player_id),
      INDEX idx_normalised_name (normalised_name),
      INDEX idx_team (team),
      INDEX idx_status (status),
      INDEX idx_last_updated (last_updated)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS game_pitchers (
      game_id VARCHAR(20) PRIMARY KEY,
      home_team VARCHAR(10),
      away_team VARCHAR(10),
      home_pitcher_id INT,
      away_pitcher_id INT,
      game_date DATE
    )
  `);
}

module.exports = { db, runMigrations };