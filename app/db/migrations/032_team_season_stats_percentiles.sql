CREATE TABLE IF NOT EXISTS team_season_stats_percentiles (
  team VARCHAR(10) PRIMARY KEY,

  runs_pct INT,
  hits_pct INT,
  hr_pct INT,
  rbi_pct INT,
  sb_pct INT,
  avg_pct DECIMAL(5,2),
  obp_pct DECIMAL(5,2),
  slg_pct DECIMAL(5,2),
  ops_pct DECIMAL(5,2),
  bb_rate_pct DECIMAL(5,2),
  k_rate_pct DECIMAL(5,2),
  woba_pct DECIMAL(5,2),
  wrc_plus_pct INT,
  iso_pct DECIMAL(5,2),
  babip_pct DECIMAL(5,2),

  era_pct DECIMAL(5,2),
  whip_pct DECIMAL(5,2),
  fip_pct DECIMAL(5,2),
  x_fip_pct DECIMAL(5,2),
  k_per_9_pct DECIMAL(5,2),
  bb_per_9_pct DECIMAL(5,2),
  hr_per_9_pct DECIMAL(5,2),
  k_pct_pct DECIMAL(5,2),
  bb_pct_pct DECIMAL(5,2),
  swinging_strike_pct_pct DECIMAL(5,2),
  csw_pct_pct DECIMAL(5,2),
  ground_ball_pct_pct DECIMAL(5,2),
  fly_ball_pct_pct DECIMAL(5,2),
  lob_pct_pct DECIMAL(5,2),

  barrel_pct_pct DECIMAL(5,2),
  hard_hit_pct_pct DECIMAL(5,2),
  avg_ev_pct DECIMAL(5,2),
  war_pct DECIMAL(5,2),

  reliability_score TINYINT UNSIGNED,
  is_reliable BOOLEAN GENERATED ALWAYS AS (reliability_score >= 70) STORED,

  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
