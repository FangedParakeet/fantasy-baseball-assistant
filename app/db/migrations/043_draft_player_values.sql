CREATE TABLE IF NOT EXISTS draft_player_values (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  model_id INT NOT NULL,
  player_pk INT NOT NULL,
  as_of_date DATE NOT NULL,

  total_value DECIMAL(10,4) NOT NULL,
  est_auction_value DECIMAL(10,2) NOT NULL,
  est_max_auction_value DECIMAL(10,2) NOT NULL,

  tier INT NULL,
  reliability_score TINYINT UNSIGNED NULL,
  risk_score TINYINT UNSIGNED NULL,

  UNIQUE KEY uniq_model_player (model_id, player_pk),
  INDEX idx_model_sort (model_id, total_value),
  INDEX idx_model_price (model_id, est_auction_value),
  INDEX idx_model_tier (model_id, tier),
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE,
  FOREIGN KEY (player_pk) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
