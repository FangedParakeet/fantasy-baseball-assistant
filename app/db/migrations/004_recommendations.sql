CREATE TABLE IF NOT EXISTS recommendations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  alt_player_name VARCHAR(100),
  alt_positions VARCHAR(50),
  description TEXT,
  rating INT CHECK (rating >= 0 AND rating <= 100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
