import pandas as pd
from models.risk_scorer import RiskScorer
import numpy as np

class Projections:
    HITTER_FORM_WEIGHT = 0.30
    PITCHER_FORM_WEIGHT = 0.30
    ROLLING_STATS_SUFFIX = "_roll"
    ADVANCED_ROLLING_STATS_SUFFIX = "_adv_roll"
    HITTER_SEASON_COUNTING_COLUMNS = ["runs", "rbi", "hr", "sb", "ab"]
    HITTER_ROLLING_COLUMNS = ["runs", "rbi", "hr", "sb", "abs"]
    # Rolling stats use "abs"; merge only suffixes duplicate names, so post-merge column stays "abs" (season has "ab")
    HITTER_ROLLING_COL_AFTER_MERGE = ["runs_roll", "rbi_roll", "hr_roll", "sb_roll", "abs"]

    PITCHER_SEASON_COUNTING_COLUMNS = ["ip", "qs", "sv", "hld"]
    PITCHER_ROLLING_COUNTING_COLUMNS = ["ip", "qs", "sv", "hld"]

    def __init__(
        self,
        risk_scorer: RiskScorer,
        players_df: pd.DataFrame, 
        player_season_stats_df: pd.DataFrame, 
        use_season_stats: bool = True,
        use_rolling_stats: bool = True
    ):
        self.risk_scorer = risk_scorer
        self.players_df = players_df
        self.player_season_stats_df = player_season_stats_df
        self.use_season_stats = use_season_stats
        self.use_rolling_stats = use_rolling_stats

    def _ensure_rolling_columns(self, df: pd.DataFrame, *, is_hitter: bool, advanced: bool) -> pd.DataFrame:
        """If df is empty, return an empty DataFrame with the columns needed for merge/blend so downstream code does not KeyError."""
        if not df.empty:
            return df
        if is_hitter and not advanced:
            cols = ["mlb_player_id", "position", "runs", "rbi", "hr", "sb", "abs", "avg"]
        elif is_hitter and advanced:
            cols = ["mlb_player_id", "position", "ops", "k_rate", "bb_rate", "iso"]
        elif not is_hitter and not advanced:
            cols = ["mlb_player_id", "position", "ip", "strikeouts", "qs", "sv", "hld", "era", "whip"]
        else:
            cols = ["mlb_player_id", "position", "bb_per_9", "hr_per_9", "k_bb_ratio"]
        return pd.DataFrame(columns=cols)

    def get_hitter_projections(self, player_rolling_stats_df: pd.DataFrame, player_advanced_rolling_stats_df: pd.DataFrame, span_days: int = 7) -> pd.DataFrame:
        """
            Returns df with:
                player_pk, mlb_player_id, ...,
                proj_R, proj_RBI, proj_HR, proj_SB, proj_AB, proj_AVG
        """
        # Ensure empty rolling dfs have expected columns (e.g. when span=0 / season-only)
        player_rolling_stats_df = self._ensure_rolling_columns(player_rolling_stats_df, is_hitter=True, advanced=False)
        player_advanced_rolling_stats_df = self._ensure_rolling_columns(player_advanced_rolling_stats_df, is_hitter=True, advanced=True)
        # Filter season/rolling to hitters
        season_stats_df = self.player_season_stats_df[self.player_season_stats_df["position"] == "B"].copy()
        rolling_stats_df = player_rolling_stats_df.copy()
        hitter_rolling_stats_df = rolling_stats_df[rolling_stats_df["position"] == "B"].copy()
        hitter_advanced_rolling_stats_df = player_advanced_rolling_stats_df[player_advanced_rolling_stats_df["position"] == "B"].copy()

        # Merge onto players (internal PK)
        hitters_df = self.players_df[self.players_df["position"] == "B"].copy()
        hitters_df = hitters_df.merge(season_stats_df, on=["mlb_player_id", "position"], how="left")
        hitters_df = hitters_df.merge(hitter_rolling_stats_df, on=["mlb_player_id", "position"], how="left", suffixes=("", self.ROLLING_STATS_SUFFIX))
        hitters_df = hitters_df.merge(hitter_advanced_rolling_stats_df, on=["mlb_player_id", "position"], how="left", suffixes=("", self.ADVANCED_ROLLING_STATS_SUFFIX))

        # Blend season and rolling stats
        form_weight, season_weight = self.get_weights(is_hitter=True)

        # Counting projections: blend season totals with rolling totals scaled to season games (rough)
        # MVP: treat rolling totals as-is (a “form nudge”), not a full projection system.
        hitters_df["proj_R"] = self.blend_counting_stats(hitters_df["runs"], hitters_df["runs" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)
        hitters_df["proj_RBI"] = self.blend_counting_stats(hitters_df["rbi"], hitters_df["rbi" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)
        hitters_df["proj_HR"] = self.blend_counting_stats(hitters_df["hr"], hitters_df["hr" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)
        hitters_df["proj_SB"] = self.blend_counting_stats(hitters_df["sb"], hitters_df["sb" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)

        # Volume for AVG impact (AB); rolling column is "abs" (no suffix, since season has "ab")
        hitters_df["proj_AB"] = self.blend_counting_stats(hitters_df["ab"], hitters_df["abs"], season_weight, form_weight).clip(lower=0)

        # AVG rate blend
        hitters_df["proj_AVG"] = self.blend_rate_stats(hitters_df["avg"], hitters_df["avg" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)

        hitters_df["has_stats"] = (
            hitters_df[self.HITTER_SEASON_COUNTING_COLUMNS + self.HITTER_ROLLING_COL_AFTER_MERGE]
            .astype(float).fillna(0).sum(axis=1) > 0
        )

        hitters_df = hitters_df[hitters_df["has_stats"]]

        hitters_df = self.risk_scorer.add_hitter_risk_and_reliability_scores(hitters_df, span_days=span_days)

        return hitters_df

    def get_pitcher_projections(self, player_rolling_stats_df: pd.DataFrame, player_advanced_rolling_stats_df: pd.DataFrame, span_days: int = 7) -> pd.DataFrame:
        """
            Returns df with:
                player_pk, mlb_player_id, ...,
                proj_K, proj_QS, proj_SVH, proj_IP, proj_ERA, proj_WHIP
        """
        # Ensure empty rolling dfs have expected columns (e.g. when span=0 / season-only)
        player_rolling_stats_df = self._ensure_rolling_columns(player_rolling_stats_df, is_hitter=False, advanced=False)
        player_advanced_rolling_stats_df = self._ensure_rolling_columns(player_advanced_rolling_stats_df, is_hitter=False, advanced=True)
        season_stats_df = self.player_season_stats_df[self.player_season_stats_df["position"] == "P"].copy()
        rolling_stats_df = player_rolling_stats_df.copy()
        pitcher_rolling_stats_df = rolling_stats_df[rolling_stats_df["position"] == "P"].copy()
        pitcher_advanced_rolling_stats_df = player_advanced_rolling_stats_df[player_advanced_rolling_stats_df["position"] == "P"].copy()

        pitchers_df = self.players_df[self.players_df["position"] == "P"].copy()
        pitchers_df = pitchers_df.merge(season_stats_df, on=["mlb_player_id", "position"], how="left", suffixes=("", "_season"))
        pitchers_df = pitchers_df.merge(pitcher_rolling_stats_df, on=["mlb_player_id", "position"], how="left", suffixes=("", self.ROLLING_STATS_SUFFIX))
        pitchers_df = pitchers_df.merge(pitcher_advanced_rolling_stats_df, on=["mlb_player_id", "position"], how="left", suffixes=("", self.ADVANCED_ROLLING_STATS_SUFFIX))

        form_weight, season_weight = self.get_weights(is_hitter=False)

        # Project IP (volume)
        pitchers_df["proj_IP"] = self.blend_counting_stats(pitchers_df["ip"], pitchers_df["ip" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight).clip(lower=0)

        # Season K derived from k_per_9 * IP / 9; rolling uses strikeouts (counting)
        season_strikeouts = (pitchers_df["k_per_9"].astype(float).fillna(0.0) * pitchers_df["ip"].astype(float).fillna(0.0)) / 9.0
        pitchers_df["proj_K"] = self.blend_counting_stats(season_strikeouts, pitchers_df["strikeouts"], season_weight, form_weight)

        # QS is counting in both
        pitchers_df["proj_QS"] = self.blend_counting_stats(pitchers_df["qs"], pitchers_df["qs" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)

        # SVH = SV + HLD
        season_svh = pitchers_df["sv"].astype(float).fillna(0.0) + pitchers_df["hld"].astype(float).fillna(0.0)
        roll_svh = pitchers_df["sv" + self.ROLLING_STATS_SUFFIX].astype(float).fillna(0.0) + pitchers_df["hld" + self.ROLLING_STATS_SUFFIX].astype(float).fillna(0.0)
        pitchers_df["proj_SVH"] = self.blend_counting_stats(season_svh, roll_svh, season_weight, form_weight)

        # ERA/WHIP rates blend (we’ll convert to *impact* later using IP)
        pitchers_df["proj_ERA"] = self.blend_rate_stats(pitchers_df["era"], pitchers_df["era" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)
        pitchers_df["proj_WHIP"] = self.blend_rate_stats(pitchers_df["whip"], pitchers_df["whip" + self.ROLLING_STATS_SUFFIX], season_weight, form_weight)

        pitchers_df["has_stats"] = (
            pitchers_df[self.PITCHER_SEASON_COUNTING_COLUMNS + [col + self.ROLLING_STATS_SUFFIX for col in self.PITCHER_ROLLING_COUNTING_COLUMNS]]
            .astype(float).fillna(0).sum(axis=1) > 0
            | (pitchers_df["k_per_9"].astype(float).fillna(0.0) > 0)
            | (pitchers_df["strikeouts"].astype(float).fillna(0.0) > 0)
        )

        pitchers_df = pitchers_df[pitchers_df["has_stats"]]

        pitchers_df = self.risk_scorer.add_pitcher_risk_and_reliability_scores(pitchers_df, span_days=span_days)

        return pitchers_df


    def blend_counting_stats(self, season: pd.Series, rolling: pd.Series, season_weight: float, form_weight: float) -> pd.Series:
        # Coerce to float (DB may return Decimal); missing handled as 0
        s = season.astype(float).fillna(0.0)
        r = rolling.astype(float).fillna(0.0)
        return season_weight * s + form_weight * r

    def blend_rate_stats(self, season_rate: pd.Series, rolling_rate: pd.Series, season_weight: float, form_weight: float) -> pd.Series:
        season = pd.to_numeric(season_rate, errors="coerce")
        rolling = pd.to_numeric(rolling_rate, errors="coerce")

        output = pd.Series(np.nan, index=season.index, dtype="float64")

        season_ok = season.notna()
        rolling_ok = rolling.notna()

        # both present -> blend
        output.loc[season_ok & rolling_ok] = season_weight * season.loc[season_ok & rolling_ok] + form_weight * rolling.loc[season_ok & rolling_ok]

        # only season present
        output.loc[season_ok & ~rolling_ok] = season.loc[season_ok & ~rolling_ok]

        # only rolling present
        output.loc[~season_ok & rolling_ok] = rolling.loc[~season_ok & rolling_ok]

        return output

    def get_weights(self, is_hitter: bool) -> tuple[float, float]:
        form_weight = self.HITTER_FORM_WEIGHT if is_hitter else self.PITCHER_FORM_WEIGHT
        if self.use_season_stats and self.use_rolling_stats:
            return (1.0 - form_weight, form_weight)  # (season_weight, form_weight)
        if self.use_season_stats and not self.use_rolling_stats:
            return (1.0, 0.0)
        if not self.use_season_stats and self.use_rolling_stats:
            return (0.0, 1.0)
        return (0.0, 0.0)