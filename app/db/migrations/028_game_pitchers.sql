CREATE TABLE IF NOT EXISTS game_pitchers (
  game_id VARCHAR(20) PRIMARY KEY,
  home_team VARCHAR(10),
  away_team VARCHAR(10),
  home_pitcher_id INT,
  away_pitcher_id INT,
  game_date DATE
);
