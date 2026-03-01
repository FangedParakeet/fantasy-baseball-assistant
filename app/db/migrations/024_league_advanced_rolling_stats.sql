CREATE TABLE IF NOT EXISTS league_advanced_rolling_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  span_days INT NOT NULL,
  split_type VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  obp DECIMAL(4,3),
  slg DECIMAL(4,3),
  ops DECIMAL(4,3),
  woba DECIMAL(4,3),
  fip DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_league_rolling (span_days, split_type),
  INDEX idx_league_split_window (split_type, span_days)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
