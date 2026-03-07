import pandas as pd
from typing import List, Dict
from models.draft_data_loader import CategoryConfig
from models.value_calculator import ValueCalculator
import numpy as np
from utils.logger import logger


class ZScoreCalculator(ValueCalculator):
    DEFAULT_LEAGUE_AVG = 0.250;
    DEFAULT_LEAGUE_ERA = 4.20;
    DEFAULT_LEAGUE_WHIP = 1.30;

    CATEGORY_MAP_HITTER = {
        "R": ("proj_R", False),
        "RBI": ("proj_RBI", False),
        "HR": ("proj_HR", False),
        "SB": ("proj_SB", False),
        # AVG handled separately as impact
    }
    
    CATEGORY_MAP_PITCHER = {
        "K": ("proj_K", False),
        "QS": ("proj_QS", False),
        "SVH": ("proj_SVH", False),
        # ERA/WHIP handled separately as impact
    }
    
    def __init__(self, scoring_categories: List[CategoryConfig]):
        self.scoring_categories = scoring_categories
        self.hitters_stats_df = None
        self.pitchers_stats_df = None

    def calculate_player_values(self) -> Dict[str, pd.DataFrame]:
        # Baselines for impact metrics
        league_avg_avg = self.weighted_mean(self.hitters_stats_df["proj_AVG"], self.hitters_stats_df["proj_AB"], self.DEFAULT_LEAGUE_AVG)
        league_avg_era = self.weighted_mean(self.pitchers_stats_df["proj_ERA"], self.pitchers_stats_df["proj_IP"], self.DEFAULT_LEAGUE_ERA)
        league_avg_whip = self.weighted_mean(self.pitchers_stats_df["proj_WHIP"], self.pitchers_stats_df["proj_IP"], self.DEFAULT_LEAGUE_WHIP)
        # logger.info(f"League average AVG: {league_avg_avg}, ERA: {league_avg_era}, WHIP: {league_avg_whip}")
        
        weighted_values_per_stat = []

        # Precompute impact series
        if not self.hitters_stats_df.empty:
            self.hitters_stats_df = self.hitters_stats_df.copy()
            self.hitters_stats_df["AVG_IMPACT"] = (self.hitters_stats_df["proj_AVG"].astype(float) - league_avg_avg) * self.hitters_stats_df["proj_AB"].astype(float)
        if not self.pitchers_stats_df.empty:
            self.pitchers_stats_df = self.pitchers_stats_df.copy()
            self.pitchers_stats_df["ERA_IMPACT"] = (league_avg_era - self.pitchers_stats_df["proj_ERA"].astype(float)) * self.pitchers_stats_df["proj_IP"].astype(float)
            self.pitchers_stats_df["WHIP_IMPACT"] = (league_avg_whip - self.pitchers_stats_df["proj_WHIP"].astype(float)) * self.pitchers_stats_df["proj_IP"].astype(float)

        # Compute z-scores and weighted values for each enabled category
        for category in self.scoring_categories:
            code = category.code.upper()
            weight = float(category.weight)

            if category.group == "hitter":
                if code == "AVG":
                    series = self.hitters_stats_df["AVG_IMPACT"].fillna(0.0) if not self.hitters_stats_df.empty else pd.Series(dtype=float)
                    z = self.zscore(series) if not series.empty else series
                    tmp = pd.DataFrame({
                        "player_pk": self.hitters_stats_df["player_pk"],
                        "category_code": "AVG",
                        "projection_value": self.hitters_stats_df["proj_AVG"].astype(float),  # show rate in UI
                        "zscore": z.astype(float),
                        "weighted_value": (z * weight).astype(float),
                    })
                    weighted_values_per_stat.append(tmp)

                elif code in self.CATEGORY_MAP_HITTER:
                    col, _ = self.CATEGORY_MAP_HITTER[code]
                    series = self.hitters_stats_df[col].fillna(0.0) if not self.hitters_stats_df.empty else pd.Series(dtype=float)
                    z = self.zscore(series) if not series.empty else series
                    tmp = pd.DataFrame({
                        "player_pk": self.hitters_stats_df["player_pk"],
                        "category_code": code,
                        "projection_value": self.hitters_stats_df[col].astype(float),
                        "zscore": z.astype(float),
                        "weighted_value": (z * weight).astype(float),
                    })
                    weighted_values_per_stat.append(tmp)

            elif category.group == "pitcher":
                if code == "ERA":
                    series = self.pitchers_stats_df["ERA_IMPACT"].fillna(0.0) if not self.pitchers_stats_df.empty else pd.Series(dtype=float)
                    z = self.zscore(series) if not series.empty else series
                    tmp = pd.DataFrame({
                        "player_pk": self.pitchers_stats_df["player_pk"],
                        "category_code": "ERA",
                        "projection_value": self.pitchers_stats_df["proj_ERA"].astype(float),
                        "zscore": z.astype(float),
                        "weighted_value": (z * weight).astype(float),
                    })
                    weighted_values_per_stat.append(tmp)

                elif code == "WHIP":
                    series = self.pitchers_stats_df["WHIP_IMPACT"].fillna(0.0) if not self.pitchers_stats_df.empty else pd.Series(dtype=float)
                    z = self.zscore(series) if not series.empty else series
                    tmp = pd.DataFrame({
                        "player_pk": self.pitchers_stats_df["player_pk"],
                        "category_code": "WHIP",
                        "projection_value": self.pitchers_stats_df["proj_WHIP"].astype(float),
                        "zscore": z.astype(float),
                        "weighted_value": (z * weight).astype(float),
                    })
                    weighted_values_per_stat.append(tmp)

                elif code in self.CATEGORY_MAP_PITCHER:
                    col, _ = self.CATEGORY_MAP_PITCHER[code]
                    series = self.pitchers_stats_df[col].fillna(0.0) if not self.pitchers_stats_df.empty else pd.Series(dtype=float)
                    z = self.zscore(series) if not series.empty else series
                    tmp = pd.DataFrame({
                        "player_pk": self.pitchers_stats_df["player_pk"],
                        "category_code": code,
                        "projection_value": self.pitchers_stats_df[col].astype(float),
                        "zscore": z.astype(float),
                        "weighted_value": (z * weight).astype(float),
                    })
                    weighted_values_per_stat.append(tmp)

        if not weighted_values_per_stat:
            raise RuntimeError("No scoring category components produced. Check league_scoring_categories config.")

        weighted_values_per_stat_df = pd.concat(weighted_values_per_stat, ignore_index=True)

        total_values_df = (
            weighted_values_per_stat_df.groupby("player_pk", as_index=False)["weighted_value"]
            .sum()
            .rename(columns={"weighted_value": "total_value"})
        )

        return {
            "weighted_values_per_stat_df": weighted_values_per_stat_df,
            "total_values_df": total_values_df
        }

    def safe_std(self, series: pd.Series) -> float:
        std = float(series.std(ddof=0))
        return std if std > 1e-12 else 1.0


    def zscore(self, series: pd.Series) -> pd.Series:
        mu = float(series.mean())
        sd = self.safe_std(series)
        return (series - mu) / sd

    def weighted_mean(self, value: pd.Series, weight: pd.Series, default: float) -> float:
        v = pd.to_numeric(value, errors="coerce")
        w = pd.to_numeric(weight, errors="coerce").fillna(0.0)
        mask = v.notna() & (w > 0)
        if mask.sum() == 0:
            return default
        return float((v[mask] * w[mask]).sum() / w[mask].sum())