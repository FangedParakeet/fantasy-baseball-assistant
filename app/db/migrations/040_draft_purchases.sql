CREATE TABLE IF NOT EXISTS draft_purchases (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  draft_id INT NOT NULL,
  draft_team_id INT NOT NULL,
  player_pk INT NOT NULL,

  price INT NOT NULL,

  -- For UI ordering + “move earlier/later”
  sequence_no INT NOT NULL,                 -- assigned by API; monotonically increasing by default

  purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  nominated_by_draft_team_id INT NULL,      -- optional, nullable
  note VARCHAR(255) NULL,

  UNIQUE KEY uniq_draft_player (draft_id, player_pk),
  UNIQUE KEY uniq_draft_sequence (draft_id, sequence_no),
  INDEX idx_draft_sequence_desc (draft_id, sequence_no),
  INDEX idx_draft_team (draft_id, draft_team_id),
  INDEX idx_draft_time (draft_id, purchased_at),

  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_team_id) REFERENCES draft_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (player_pk) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
