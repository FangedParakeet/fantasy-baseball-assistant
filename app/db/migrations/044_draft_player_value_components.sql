CREATE TABLE IF NOT EXISTS draft_player_value_components (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  model_id INT NOT NULL,
  player_pk INT NOT NULL,
  category_code VARCHAR(10) NOT NULL,

  projection_value DECIMAL(12,4) NULL,   -- optional projected stat/rate
  zscore DECIMAL(12,6) NULL,             -- if method=zscore
  weighted_value DECIMAL(12,6) NOT NULL, -- contribution after weights

  UNIQUE KEY uniq_comp (model_id, player_pk, category_code),
  INDEX idx_comp_player (model_id, player_pk),
  INDEX idx_comp_cat (model_id, category_code),
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE,
  FOREIGN KEY (player_pk) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
