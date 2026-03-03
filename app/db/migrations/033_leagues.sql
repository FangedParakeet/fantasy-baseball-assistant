CREATE TABLE IF NOT EXISTS leagues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  season_year INT NULL, -- optional; practice leagues can be NULL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_league_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
