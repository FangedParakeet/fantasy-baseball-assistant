CREATE TABLE IF NOT EXISTS league_rolling_stats (
  entity_type ENUM('player', 'team', 'team_vs_batter', 'team_vs_pitcher') NOT NULL,
  split_type VARCHAR(10),
  span_days INT,

  avg FLOAT,
  obp FLOAT,
  slg FLOAT,
  ops FLOAT,

  hr_per_game FLOAT,
  sb_per_game FLOAT,
  rbi_per_game FLOAT,
  runs_per_game FLOAT,
  k_per_game FLOAT,
  bb_per_game FLOAT,

  whip FLOAT,
  era FLOAT,
  fip FLOAT,
  qs_rate FLOAT,

  entity_count INT,
  PRIMARY KEY (entity_type, split_type, span_days)
);
