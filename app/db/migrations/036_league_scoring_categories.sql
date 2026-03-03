CREATE TABLE IF NOT EXISTS league_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,

  category_code VARCHAR(10) NOT NULL, -- R, RBI, AVG, HR, SB, K, ERA, WHIP, QS, SVH
  category_group ENUM('hitter','pitcher') NOT NULL,
  weight DECIMAL(6,3) NOT NULL DEFAULT 1.000,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_league_cat (league_id, category_code),
  INDEX idx_league_cat_group (league_id, category_group, sort_order),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
