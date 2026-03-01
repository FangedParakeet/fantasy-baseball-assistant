CREATE TABLE IF NOT EXISTS team_rolling_stats_percentiles (
  team VARCHAR(10),
  split_type VARCHAR(10),
  span_days INT,

  avg_runs_scored_pct DECIMAL(5,2),
  avg_runs_allowed_pct DECIMAL(5,2),
  nrfi_pct DECIMAL(5,2),

  avg_pct DECIMAL(5,2),
  obp_pct DECIMAL(5,2),
  slg_pct DECIMAL(5,2),
  ops_pct DECIMAL(5,2),

  era_pct DECIMAL(5,2),
  whip_pct DECIMAL(5,2),

  fip_pct DECIMAL(5,2),
  k_per_9_pct DECIMAL(5,2),
  bb_per_9_pct DECIMAL(5,2),
  hr_per_9_pct DECIMAL(5,2),
  k_bb_ratio_pct DECIMAL(5,2),

  reliability_score TINYINT UNSIGNED,
  is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (team, split_type, span_days)
);
