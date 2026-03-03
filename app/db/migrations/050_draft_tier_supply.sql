CREATE TABLE IF NOT EXISTS draft_tier_supply (
  draft_id INT NOT NULL,
  model_id INT NOT NULL,
  slot_code VARCHAR(20) NOT NULL,
  tier INT NOT NULL,
  remaining_count INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (draft_id, model_id, slot_code, tier),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
