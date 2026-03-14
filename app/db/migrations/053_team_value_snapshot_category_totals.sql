CREATE TABLE IF NOT EXISTS team_value_snapshot_category_totals (
  league_id INT NOT NULL,
  model_id INT NOT NULL,
  team_id INT NOT NULL,
  span_days INT NOT NULL,
  split_type VARCHAR(10) NOT NULL,
  as_of_date DATE NOT NULL,
  category_code VARCHAR(10) NOT NULL,

  total_value DOUBLE NOT NULL,
  league_avg DOUBLE NOT NULL,
  ranking INT NOT NULL,
  team_count INT NOT NULL,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, model_id, span_days, split_type, as_of_date, team_id, category_code),
  INDEX idx_slice (league_id, model_id, span_days, split_type, as_of_date),
  INDEX idx_team (league_id, model_id, team_id, span_days, split_type, as_of_date),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
