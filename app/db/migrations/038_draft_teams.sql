CREATE TABLE IF NOT EXISTS draft_teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  draft_id INT NOT NULL,
  team_id INT NOT NULL,                     -- references existing teams(id)

  budget_total INT NOT NULL DEFAULT 260,
  is_user_team BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_draft_team (draft_id, team_id),
  INDEX idx_draft_user_team (draft_id, is_user_team),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
