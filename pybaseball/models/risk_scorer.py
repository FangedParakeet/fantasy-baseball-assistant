import math
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class ReliabilityThresholds:
    # Rolling thresholds by span_days
    rolling_ab_7: int = 15
    rolling_ab_14: int = 30
    rolling_ab_30: int = 40

    rolling_ip_7: int = 4
    rolling_ip_14: int = 8
    rolling_ip_30: int = 12

    # Season thresholds
    season_pa_hitter: int = 200
    season_ip_pitcher: int = 40


class RiskScorer:
    """
    Computes reliability_score and risk_score for hitters and pitchers.

    Expected columns in hitters_df (from Projections.get_hitter_projections()):
      - position = 'B'
      - pa, ab, ops, k_rate, bb_rate, iso (season)
      - abs_roll (rolling basic)
      - ops_roll, k_rate_roll, bb_rate_roll, iso_roll (advanced rolling)

    Expected columns in pitchers_df (from Projections.get_pitcher_projections()):
      - position = 'P'
      - ip, era, whip, k_per_9, bb_per_9, hr_per_9, k_bb_ratio, swinging_strike_pct (season)
      - ip_roll (rolling basic) OR ip_roll from advanced rolling (either is fine if merged)
      - era_roll, whip_roll (rolling basic)
      - k_per_9_roll, bb_per_9_roll, hr_per_9_roll, k_bb_ratio_roll (advanced rolling)
    """

    def __init__(
        self,
        *,
        rolling_suffix: str = "_roll",
        advanced_rolling_suffix: str = "_adv_roll",
        thresholds: ReliabilityThresholds = ReliabilityThresholds(),
    ):
        self.ROLL = rolling_suffix
        self.ADVANCED_ROLL = advanced_rolling_suffix
        self.thresholds = thresholds

    # -------------------------
    # small utils
    # -------------------------

    @staticmethod
    def _safe_float(v: Any) -> Optional[float]:
        if v is None:
            return None
        try:
            if isinstance(v, float) and math.isnan(v):
                return None
            return float(v)
        except Exception:
            return None

    @staticmethod
    def _clamp(x: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, x))

    @staticmethod
    def _weighted_mean(values: Dict[str, Tuple[Optional[float], float]]) -> Optional[float]:
        numerator = 0.0
        denominator = 0.0
        for _, (val, w) in values.items():
            if val is None:
                continue
            numerator += val * w
            denominator += w
        if denominator <= 1e-12:
            return None
        return numerator / denominator

    def _rolling_ab_threshold(self, span_days: int) -> float:
        if span_days <= 7:
            return float(self.thresholds.rolling_ab_7)
        if span_days <= 14:
            return float(self.thresholds.rolling_ab_14)
        return float(self.thresholds.rolling_ab_30)

    def _rolling_ip_threshold(self, span_days: int) -> float:
        if span_days <= 7:
            return float(self.thresholds.rolling_ip_7)
        if span_days <= 14:
            return float(self.thresholds.rolling_ip_14)
        return float(self.thresholds.rolling_ip_30)

    def _bad_delta(self, roll: Any, season: Any, scale: float) -> Optional[float]:
        r = self._safe_float(roll)
        s = self._safe_float(season)
        if r is None or s is None:
            return None
        return self._clamp(abs(r - s) / scale, 0.0, 1.0)


    # -------------------------
    # reliability
    # -------------------------

    def compute_hitter_reliability_score(self, row: pd.Series, span_days: int) -> int:
        """
        reliability = max(season_reliability, rolling_reliability) * 100
        season_reliability: pa / 200
        rolling_reliability: abs_roll / threshold(span_days)
        """
        pa = self._safe_float(row.get("pa"))
        season_reliability = 0.0 if pa is None else self._clamp(pa / float(self.thresholds.season_pa_hitter), 0.0, 1.0)

        ab_roll = self._safe_float(row.get(f"abs{self.ROLL}"))
        rolling_reliability = 0.0 if ab_roll is None else self._clamp(ab_roll / self._rolling_ab_threshold(span_days), 0.0, 1.0)

        reliability = max(season_reliability, rolling_reliability)
        return int(round(reliability * 100))

    def compute_pitcher_reliability_score(self, row: pd.Series, span_days: int) -> int:
        """
        reliability = max(season_reliability, rolling_reliability) * 100
        season_reliability: ip / 40
        rolling_reliability: ip_roll / threshold(span_days)
        """
        ip = self._safe_float(row.get("ip"))
        season_reliability = 0.0 if ip is None else self._clamp(ip / float(self.thresholds.season_ip_pitcher), 0.0, 1.0)

        ip_roll = self._safe_float(row.get(f"ip{self.ROLL}"))
        rolling_reliability = 0.0 if ip_roll is None else self._clamp(ip_roll / self._rolling_ip_threshold(span_days), 0.0, 1.0)

        reliability = max(season_reliability, rolling_reliability)
        return int(round(reliability * 100))

    # -------------------------
    # risk scoring
    # -------------------------

    def compute_hitter_risk_score(self, row: pd.Series, *, span_days: int, reliability_score: int) -> int:
        """
        risk = 0.45*sample + 0.35*divergence + 0.20*profile
        divergence uses (rolling vs season): OPS, K%, BB%, ISO with rolling AB confidence
        profile uses (season): K% high, BB% low, ISO high-ish (small weight)
        """
        # 1) sample
        reliability = self._clamp(float(reliability_score), 0.0, 100.0)
        sample_risk = 100.0 - reliability

        # 2) divergence
        roll_ab = self._safe_float(row.get(f"abs{self.ROLL}")) or 0.0
        confidence = self._clamp(roll_ab / self._rolling_ab_threshold(span_days), 0.0, 1.0)

        # season metrics
        season_ops = row.get("ops")
        season_k = row.get("k_rate")
        season_bb = row.get("bb_rate")
        season_iso = row.get("iso")

        # rolling advanced metrics (these should exist due to your merges)
        roll_ops = row.get(f"ops{self.ADVANCED_ROLL}")
        roll_k = row.get(f"k_rate{self.ADVANCED_ROLL}")
        roll_bb = row.get(f"bb_rate{self.ADVANCED_ROLL}")
        roll_iso = row.get(f"iso{self.ADVANCED_ROLL}")

        ops_bad = self._bad_delta(roll_ops, season_ops, 0.150)
        k_bad = self._bad_delta(roll_k, season_k, 8.0)       # percentage points
        bb_bad = self._bad_delta(roll_bb, season_bb, 5.0)    # percentage points
        iso_bad = self._bad_delta(roll_iso, season_iso, 0.060)

        divergence_unit = self._weighted_mean({
            "ops": (ops_bad, 0.40),
            "k": (k_bad, 0.30),
            "bb": (bb_bad, 0.15),
            "iso": (iso_bad, 0.15),
        })
        divergence_risk = 0.0 if divergence_unit is None else 100.0 * confidence * divergence_unit

        # 3) profile (season only)
        sk = self._safe_float(season_k)
        sbb = self._safe_float(season_bb)
        siso = self._safe_float(season_iso)

        # K%: 28%+ starts getting fragile; 38% is maxed
        k_profile = None if sk is None else self._clamp((sk - 28.0) / 10.0, 0.0, 1.0)
        # BB%: below ~7% means less floor / more volatile outcomes (mild)
        bb_profile = None if sbb is None else self._clamp((7.0 - sbb) / 4.0, 0.0, 1.0)
        # ISO: very high ISO can be boom/bust (small weight)
        iso_profile = None if siso is None else self._clamp((siso - 0.220) / 0.080, 0.0, 1.0)

        profile_unit = self._weighted_mean({
            "k": (k_profile, 0.70),
            "bb": (bb_profile, 0.20),
            "iso": (iso_profile, 0.10),
        })
        profile_risk = 0.0 if profile_unit is None else 100.0 * profile_unit

        risk = 0.45 * sample_risk + 0.35 * divergence_risk + 0.20 * profile_risk
        return int(round(self._clamp(risk, 0.0, 100.0)))

    def compute_pitcher_risk_score(self, row: pd.Series, *, span_days: int, reliability_score: int) -> int:
        """
        risk = 0.45*sample + 0.35*divergence + 0.20*profile
        divergence uses (rolling vs season): ERA, WHIP, K/9, BB/9, HR/9 (+ small K/BB) with rolling IP confidence
        profile uses (season): BB/9 high, HR/9 high, K/BB low, SwStr% low
        """
        # 1) sample
        rel = self._clamp(float(reliability_score), 0.0, 100.0)
        sample_risk = 100.0 - rel

        # 2) divergence
        roll_ip = self._safe_float(row.get(f"ip{self.ROLL}")) or 0.0
        confidence = self._clamp(roll_ip / self._rolling_ip_threshold(span_days), 0.0, 1.0)

        # season metrics
        season_era = row.get("era")
        season_whip = row.get("whip")
        season_k9 = row.get("k_per_9")
        season_bb9 = row.get("bb_per_9")
        season_hr9 = row.get("hr_per_9")
        season_kbb = row.get("k_bb_ratio")
        season_sw = row.get("swinging_strike_pct")

        # rolling metrics:
        # - ERA/WHIP from basic rolling stats (era_roll, whip_roll)
        # - K/9, BB/9, HR/9, K/BB from advanced rolling stats (k_per_9_roll etc)
        roll_era = row.get(f"era{self.ROLL}")
        roll_whip = row.get(f"whip{self.ROLL}")
        roll_k9 = row.get(f"k_per_9{self.ADVANCED_ROLL}")
        roll_bb9 = row.get(f"bb_per_9{self.ADVANCED_ROLL}")
        roll_hr9 = row.get(f"hr_per_9{self.ADVANCED_ROLL}")
        roll_kbb = row.get(f"k_bb_ratio{self.ADVANCED_ROLL}")

        era_bad = self._bad_delta(roll_era, season_era, 1.25)
        whip_bad = self._bad_delta(roll_whip, season_whip, 0.20)
        k9_bad = self._bad_delta(roll_k9, season_k9, 2.0)
        bb9_bad = self._bad_delta(roll_bb9, season_bb9, 1.2)
        hr9_bad = self._bad_delta(roll_hr9, season_hr9, 0.7)
        kbb_bad = self._bad_delta(roll_kbb, season_kbb, 1.5)

        divergence_unit = self._weighted_mean({
            "era": (era_bad, 0.30),
            "whip": (whip_bad, 0.25),
            "k9": (k9_bad, 0.20),
            "bb9": (bb9_bad, 0.15),
            "hr9": (hr9_bad, 0.07),
            "kbb": (kbb_bad, 0.03),
        })
        divergence_risk = 0.0 if divergence_unit is None else 100.0 * confidence * divergence_unit

        # 3) profile (season)
        s_bb9 = self._safe_float(season_bb9)
        s_hr9 = self._safe_float(season_hr9)
        s_kbb = self._safe_float(season_kbb)
        s_sw = self._safe_float(season_sw)

        bb_profile = None if s_bb9 is None else self._clamp((s_bb9 - 3.5) / 2.0, 0.0, 1.0)
        hr_profile = None if s_hr9 is None else self._clamp((s_hr9 - 1.2) / 0.8, 0.0, 1.0)
        kbb_profile = None if s_kbb is None else self._clamp((2.8 - s_kbb) / 1.5, 0.0, 1.0)
        sw_profile = None if s_sw is None else self._clamp((10.0 - s_sw) / 4.0, 0.0, 1.0)

        profile_unit = self._weighted_mean({
            "bb9": (bb_profile, 0.35),
            "hr9": (hr_profile, 0.25),
            "kbb": (kbb_profile, 0.25),
            "swstr": (sw_profile, 0.15),
        })
        profile_risk = 0.0 if profile_unit is None else 100.0 * profile_unit

        risk = 0.45 * sample_risk + 0.35 * divergence_risk + 0.20 * profile_risk
        return int(round(self._clamp(risk, 0.0, 100.0)))

    # -------------------------
    # dataframe helpers
    # -------------------------

    def add_hitter_risk_and_reliability_scores(self, hitters_df: pd.DataFrame, *, span_days: int) -> pd.DataFrame:
        df = hitters_df.copy()
        # reliability first
        df["reliability_score"] = df.apply(lambda r: self.compute_hitter_reliability_score(r, span_days), axis=1)
        df["risk_score"] = df.apply(
            lambda r: self.compute_hitter_risk_score(
                r,
                span_days=span_days,
                reliability_score=int(r["reliability_score"]),
            ),
            axis=1
        )
        return df

    def add_pitcher_risk_and_reliability_scores(self, pitchers_df: pd.DataFrame, *, span_days: int) -> pd.DataFrame:
        df = pitchers_df.copy()
        df["reliability_score"] = df.apply(lambda r: self.compute_pitcher_reliability_score(r, span_days), axis=1)
        df["risk_score"] = df.apply(
            lambda r: self.compute_pitcher_risk_score(
                r,
                span_days=span_days,
                reliability_score=int(r["reliability_score"]),
            ),
            axis=1
        )
        return df