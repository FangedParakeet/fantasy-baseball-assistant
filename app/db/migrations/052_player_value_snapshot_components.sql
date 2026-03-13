CREATE TABLE IF NOT EXISTS player_value_snapshot_components (
  model_id INT NOT NULL,
  player_pk INT NOT NULL,
  span_days INT NOT NULL,
  split_type VARCHAR(10) NOT NULL,
  as_of_date DATE NOT NULL,

  category_code VARCHAR(10) NOT NULL,
  projection_value DOUBLE NULL,
  zscore DOUBLE NULL,
  weighted_value DOUBLE NOT NULL,
  tier INT NULL,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (model_id, player_pk, span_days, split_type, as_of_date, category_code),
  INDEX idx_cat_slice (model_id, span_days, split_type, as_of_date, category_code)
);