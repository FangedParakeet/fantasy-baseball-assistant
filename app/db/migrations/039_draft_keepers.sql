CREATE TABLE IF NOT EXISTS draft_keepers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  draft_id INT NOT NULL,
  draft_team_id INT NOT NULL,
  player_pk INT NOT NULL,                   -- references players.id

  cost INT NOT NULL,
  locked_slot_code VARCHAR(20) NULL,        -- optional future-proofing
  note VARCHAR(255) NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_keeper (draft_id, draft_team_id, player_pk),
  INDEX idx_draft_keeper_player (draft_id, player_pk),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_team_id) REFERENCES draft_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (player_pk) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
