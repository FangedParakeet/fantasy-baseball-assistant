CREATE TABLE IF NOT EXISTS draft_team_state (
  draft_id INT NOT NULL,
  draft_team_id INT NOT NULL,

  budget_spent INT NOT NULL DEFAULT 0,
  budget_remaining INT NOT NULL DEFAULT 0,

  roster_spots_total INT NOT NULL DEFAULT 0,
  roster_spots_filled INT NOT NULL DEFAULT 0,
  roster_spots_remaining INT NOT NULL DEFAULT 0,

  hard_max_bid INT NOT NULL DEFAULT 0,

  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (draft_id, draft_team_id),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_team_id) REFERENCES draft_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
