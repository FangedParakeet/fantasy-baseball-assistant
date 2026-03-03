CREATE TABLE IF NOT EXISTS draft_team_player_limits (
  draft_id INT NOT NULL,
  model_id INT NOT NULL,
  draft_team_id INT NOT NULL,
  player_pk INT NOT NULL,

  max_bid_for_team INT NOT NULL,
  fit_score DECIMAL(8,3) NOT NULL DEFAULT 0.000,

  need_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1.000,
  inflation_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1.000,

  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (draft_id, model_id, draft_team_id, player_pk),
  INDEX idx_team_limits_sort (draft_id, model_id, draft_team_id, max_bid_for_team),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES draft_value_models(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_team_id) REFERENCES draft_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (player_pk) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
