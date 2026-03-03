CREATE TABLE IF NOT EXISTS draft_position_replacement (
  draft_id INT NOT NULL,
  model_id INT NOT NULL,
  slot_code VARCHAR(20) NOT NULL,               -- C, 1B, 2B, SS, OF, UTIL, SP, RP, P
  replacement_value DECIMAL(10,4) NOT NULL,
  replacement_price DECIMAL(10,2) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (draft_id, model_id, slot_code),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
