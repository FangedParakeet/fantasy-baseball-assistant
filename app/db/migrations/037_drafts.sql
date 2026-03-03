CREATE TABLE IF NOT EXISTS drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,

  name VARCHAR(100) NOT NULL,               -- "Practice 1", "Live Auction"
  is_active BOOLEAN NOT NULL DEFAULT TRUE,  -- lets you re-enter; enforce “one active” in app logic
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,

  INDEX idx_league_active (league_id, is_active),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
