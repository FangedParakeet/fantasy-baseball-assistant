CREATE TABLE IF NOT EXISTS team_vs_batter_splits (
  team VARCHAR(10),
  bats CHAR(1),
  span_days INT,
  start_date DATE,
  end_date DATE,
  games_played INT,

  ab INT,
  hits INT,
  doubles INT,
  triples INT,
  hr INT,
  rbi INT,
  runs INT,
  sb INT,
  bb INT,
  k INT,
  sac_flies INT,
  hbp INT,
  ground_into_dp INT,

  avg DECIMAL(4,3),
  obp DECIMAL(4,3),
  slg DECIMAL(5,3),
  ops DECIMAL(5,3),
  so_rate DECIMAL(5,2),
  bb_rate DECIMAL(5,2),

  PRIMARY KEY (team, bats, span_days)
);
