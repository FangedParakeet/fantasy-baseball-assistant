CREATE TABLE IF NOT EXISTS league_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,
  budget_total INT NOT NULL DEFAULT 260,
  team_count INT NOT NULL DEFAULT 10,

  -- Used when converting value → $ (tweakable later)
  hitter_budget_pct DECIMAL(5,2) NOT NULL DEFAULT 65.00,
  pitcher_budget_pct DECIMAL(5,2) NOT NULL DEFAULT 35.00,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_league_settings (league_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
