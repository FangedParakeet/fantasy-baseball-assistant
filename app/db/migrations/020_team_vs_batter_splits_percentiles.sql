CREATE TABLE IF NOT EXISTS team_vs_batter_splits_percentiles (
  team VARCHAR(10),
  bats CHAR(1),
  span_days INT,
  ops_pct DECIMAL(5,2),
  so_rate_pct DECIMAL(5,2),
  bb_rate_pct DECIMAL(5,2),

  reliability_score TINYINT UNSIGNED,
  is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (team, bats, span_days)
);
