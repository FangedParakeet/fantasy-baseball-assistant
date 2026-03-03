CREATE TABLE IF NOT EXISTS draft_inflation_state (
  draft_id INT NOT NULL,
  model_id INT NOT NULL,

  total_spent INT NOT NULL DEFAULT 0,
  total_est_value_spent DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  inflation_multiplier DECIMAL(8,4) NOT NULL DEFAULT 1.0000,

  hitter_spent INT NOT NULL DEFAULT 0,
  hitter_est_value_spent DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  hitter_inflation_multiplier DECIMAL(8,4) NOT NULL DEFAULT 1.0000,

  pitcher_spent INT NOT NULL DEFAULT 0,
  pitcher_est_value_spent DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pitcher_inflation_multiplier DECIMAL(8,4) NOT NULL DEFAULT 1.0000,

  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (draft_id, model_id),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
