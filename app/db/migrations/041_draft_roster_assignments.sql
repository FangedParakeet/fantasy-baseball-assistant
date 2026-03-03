CREATE TABLE IF NOT EXISTS draft_roster_assignments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  draft_id INT NOT NULL,
  draft_team_id INT NOT NULL,
  player_pk INT NOT NULL,

  slot_code VARCHAR(20) NOT NULL,           -- current placement
  locked BOOLEAN NOT NULL DEFAULT FALSE,    -- optional future-proof

  source ENUM('keeper','purchase','manual') NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_team_player (draft_id, draft_team_id, player_pk),
  INDEX idx_team_slot (draft_id, draft_team_id, slot_code),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_team_id) REFERENCES draft_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (player_pk) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
