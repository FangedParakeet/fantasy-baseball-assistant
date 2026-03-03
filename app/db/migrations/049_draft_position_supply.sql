CREATE TABLE IF NOT EXISTS draft_position_supply (
  draft_id INT NOT NULL,
  model_id INT NOT NULL,
  slot_code VARCHAR(20) NOT NULL,

  remaining_above_replacement INT NOT NULL,
  slots_remaining_league INT NOT NULL,

  scarcity_index DECIMAL(8,4) NOT NULL,         -- remaining_above_replacement / slots_remaining_league
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (draft_id, model_id, slot_code),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
