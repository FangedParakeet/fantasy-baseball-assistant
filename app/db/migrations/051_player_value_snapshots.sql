CREATE TABLE IF NOT EXISTS player_value_snapshots (
  model_id INT NOT NULL,
  player_pk INT NOT NULL,
  mlb_player_id INT NOT NULL,
  position VARCHAR(10) NOT NULL,          -- B/P
  span_days INT NOT NULL,                 -- 0 season, 7/14/30
  split_type VARCHAR(10) NOT NULL,        -- overall/home/away/vs_lhp/vs_rhp
  as_of_date DATE NOT NULL,

  total_value DOUBLE NOT NULL,
  tier INT NULL,
  reliability_score INT NULL,
  risk_score INT NULL,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (model_id, player_pk, span_days, split_type, as_of_date),
  INDEX idx_slice (model_id, span_days, split_type, as_of_date),
  INDEX idx_player (player_pk, as_of_date)
);