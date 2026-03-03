CREATE TABLE IF NOT EXISTS draft_value_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,

  name VARCHAR(100) NOT NULL, -- "zscore_blend_v1"
  method ENUM('zscore','sgp') NOT NULL DEFAULT 'zscore',

  split_type VARCHAR(10) NOT NULL DEFAULT 'overall',

  hitter_span_days INT NOT NULL DEFAULT 30,
  pitcher_span_days INT NOT NULL DEFAULT 30,

  use_season_stats BOOLEAN NOT NULL DEFAULT TRUE,
  use_rolling_stats BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_league_model_name (league_id, name),
  INDEX idx_league_model (league_id, created_at),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
