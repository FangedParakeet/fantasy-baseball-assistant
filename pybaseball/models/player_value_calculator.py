import pandas as pd
from typing import Dict, Tuple, List
from models.value_calculator import ValueCalculator
from models.player_data_loader import LeagueSettings
import numpy as np

class PlayerValueCalculator:
    DEFAULT_LEAGUE_AVG = 0.250;
    DEFAULT_LEAGUE_ERA = 4.20;
    DEFAULT_LEAGUE_WHIP = 1.25;
    TIER_GAP_MULT = 3.0
    MIN_DOLLAR_VALUE = 1

    HITTER_SLOTS = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL"]
    PITCHER_SLOTS = ["SP", "RP", "P"]

    BASE_COLUMNS = ["player_pk", "mlb_player_id", "name", "mlb_team", "position",
                 "is_c", "is_1b", "is_2b", "is_3b", "is_ss", "is_of", "is_util", "is_sp", "is_rp"]
    OUTPUT_COLUMNS = ["player_pk", "total_value", "est_auction_value", "est_max_auction_value", "tier", "reliability_score", "risk_score"]
    
    def __init__(
        self, 
        calculator: ValueCalculator,
        league: LeagueSettings,
        roster_slots: pd.DataFrame,
        all_players_df: pd.DataFrame,
        hitters_stats_df: pd.DataFrame,
        pitchers_stats_df: pd.DataFrame
    ):
        self.calculator = calculator
        self.league = league
        self.roster_slots = roster_slots
        self.all_players_df = all_players_df
        self.hitters_stats_df = hitters_stats_df
        self.pitchers_stats_df = pitchers_stats_df

    def get_player_value_snapshots(self, roster_df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
        """
        Returns a dict with:
            - "player_value_totals_df": player total value snapshots (with tier, reliability_score, risk_score).
            - "player_value_components_df": per-stat weighted value components with per-category tier.
        """
        # Compute values
        values = self.calculator.calculate_player_values()
        player_value_components_df = values["weighted_values_per_stat_df"].copy()
        player_value_totals_df = values["total_values_df"].copy()

        # Join metadata for snapshots
        meta = self.all_players_df[["player_pk", "mlb_player_id", "position"]].copy()
        player_value_totals_df = player_value_totals_df.merge(meta, on="player_pk", how="left")

        # Add reliability/risk (from projections)
        extra = pd.concat([
            self.hitters_stats_df[["player_pk", "reliability_score", "risk_score"]],
            self.pitchers_stats_df[["player_pk", "reliability_score", "risk_score"]],
        ], ignore_index=True).groupby("player_pk", as_index=False).max()
        player_value_totals_df = player_value_totals_df.merge(extra, on="player_pk", how="left")

        # Tier per slice, split hitters/pitchers
        hitters_totals = player_value_totals_df[player_value_totals_df["position"] == "B"].copy().sort_values("total_value", ascending=False)
        pitchers_totals = player_value_totals_df[player_value_totals_df["position"] == "P"].copy().sort_values("total_value", ascending=False)

        hitters_totals["tier"] = self.calculate_tiers(hitters_totals["total_value"])
        pitchers_totals["tier"] = self.calculate_tiers(pitchers_totals["total_value"])

        player_value_totals_df = pd.concat([hitters_totals, pitchers_totals], ignore_index=True)

        # Per-category tiers (also split B/P)
        # Player value components df has player_pk, category_code, weighted_value
        player_value_components_df = player_value_components_df.merge(meta, on="player_pk", how="left")
        player_value_components_df["tier"] = None
        for group_pos in ["B", "P"]:
            group_components = player_value_components_df[player_value_components_df["position"] == group_pos].copy()
            for cat in group_components["category_code"].unique():
                idx = group_components["category_code"] == cat
                sub = group_components[idx].sort_values("weighted_value", ascending=False)
                group_components.loc[sub.index, "tier"] = self.calculate_tiers(sub["weighted_value"]).values
            player_value_components_df.loc[group_components.index, "tier"] = group_components["tier"]

        # Compute league aggregates
        category_totals_df, position_totals_df = self.compute_league_aggregates(roster_df, player_value_totals_df, player_value_components_df)

        return {
            "player_value_totals_df": player_value_totals_df,
            "player_value_components_df": player_value_components_df,
            "category_totals_df": category_totals_df,
            "position_totals_df": position_totals_df
        }

    def compute_league_aggregates(
        self,
        roster_df: pd.DataFrame,
        totals_df: pd.DataFrame,
        components_df: pd.DataFrame,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Build team_value_snapshot_category_totals and team_value_snapshot_position_totals
        from roster (player_pk, team_id, selected_position, position), snapshot totals,
        and snapshot components. Returns (category_totals_df, position_totals_df).
        """
        if roster_df.empty:
            return (
                pd.DataFrame(columns=["team_id", "category_code", "total_value", "league_avg", "rank", "team_count"]),
                pd.DataFrame(columns=["team_id", "slot_code", "total_value", "player_count", "league_avg", "rank", "team_count"]),
            )

        roster = roster_df.copy()
        # Merge in eligibility flags so we can derive slot_code(s) from eligible_positions
        elig_cols = ["player_pk", "position", "is_c", "is_1b", "is_2b", "is_3b", "is_ss", "is_of", "is_util", "is_sp", "is_rp"]
        roster = roster.merge(
            self.all_players_df[elig_cols].drop_duplicates(subset=["player_pk"]),
            on="player_pk",
            how="left",
            suffixes=("", "_elig"),
        )
        # If position came from both, keep roster's; otherwise ensure we have position
        if "position_elig" in roster.columns:
            roster["position"] = roster["position"].fillna(roster["position_elig"])
            roster = roster.drop(columns=["position_elig"])

        # Build one row per (player_pk, team_id, slot_code) so multi-eligible players count in multiple columns
        rows_expanded = []
        for _, row in roster.iterrows():
            for slot in self.get_eligible_slot_codes(row):
                rows_expanded.append({"player_pk": row["player_pk"], "team_id": row["team_id"], "slot_code": slot})
        roster_expanded = pd.DataFrame(rows_expanded)
        if roster_expanded.empty:
            roster_expanded = pd.DataFrame(columns=["player_pk", "team_id", "slot_code"])

        # --- By category: merge roster + components, sum weighted_value per (team_id, category_code), then league_avg + rank
        roster_components = components_df[["player_pk", "category_code", "weighted_value"]].merge(
            roster[["player_pk", "team_id"]], on="player_pk", how="inner"
        )
        if roster_components.empty:
            category_totals = pd.DataFrame(columns=["team_id", "category_code", "total_value", "league_avg", "rank", "team_count"])
        else:
            team_category_totals = roster_components.groupby(["team_id", "category_code"], as_index=False).agg(total_value=("weighted_value", "sum"))
            league_avg = team_category_totals.groupby("category_code", as_index=False)["total_value"].mean().rename(columns={"total_value": "league_avg"})
            team_category_totals = team_category_totals.merge(league_avg, on="category_code", how="left")
            team_category_totals["rank"] = team_category_totals.groupby("category_code")["total_value"].rank(method="min", ascending=False).astype(int)
            team_category_totals["team_count"] = team_category_totals.groupby("category_code")["team_id"].transform("nunique")
            category_totals = team_category_totals[["team_id", "category_code", "total_value", "league_avg", "rank", "team_count"]]

        # --- By position: use expanded roster so multi-eligible players contribute to each eligible slot
        roster_totals = totals_df[["player_pk", "total_value"]].merge(
            roster_expanded[["player_pk", "team_id", "slot_code"]], on="player_pk", how="inner"
        )
        if roster_totals.empty:
            position_totals = pd.DataFrame(columns=["team_id", "slot_code", "total_value", "player_count", "league_avg", "rank", "team_count"])
        else:
            team_position_totals = roster_totals.groupby(["team_id", "slot_code"], as_index=False).agg(
                total_value=("total_value", "sum"),
                player_count=("player_pk", "count"),
            )
            league_avg_position = team_position_totals.groupby("slot_code", as_index=False).agg(
                league_avg=("total_value", "mean"),
                team_count=("team_id", "nunique"),
            )
            team_position_totals = team_position_totals.merge(league_avg_position, on="slot_code", how="left")
            team_position_totals["rank"] = team_position_totals.groupby("slot_code")["total_value"].rank(method="min", ascending=False).astype(int)
            position_totals = team_position_totals[["team_id", "slot_code", "total_value", "player_count", "league_avg", "rank", "team_count"]]

        return category_totals, position_totals

    def get_player_dollar_values(self) -> Dict[str, pd.DataFrame]:
        """
            Convert total_value into estimated auction dollars (est_auction_value + max).
            Uses a replacement-level approach per broad group:
            - Determine a replacement baseline for hitters and pitchers from roster demand.
            - Allocate hitter dollars and pitcher dollars separately across players above replacement.
        """
        calculated_values = self.setup_player_values()
        player_total_values_df = calculated_values["player_values_df"]
        player_value_components_df = calculated_values["player_value_components_df"]
        player_total_values_df = player_total_values_df.copy()

        replacement_values = self.calculate_replacement_values_for_players(player_total_values_df)
        hitter_replacement_value = replacement_values["hitter_replacement_value"]
        pitcher_replacement_value = replacement_values["pitcher_replacement_value"]
        
        # Choose a single baseline per group for dollar allocation.
        # MVP: hitters baseline = min replacement among core hitter slots (excluding UTIL),
        # pitchers baseline = min replacement among SP/RP/P.
        player_total_values_df["is_pitcher"] = player_total_values_df["position"] == "P"

        # Value above replacement
        player_total_values_df["var"] = np.where(
            player_total_values_df["is_pitcher"],
            player_total_values_df["total_value"] - pitcher_replacement_value, 
            player_total_values_df["total_value"] - hitter_replacement_value
        )
        player_total_values_df["var"] = player_total_values_df["var"].astype(float)

        # Only allocate dollars to above-replacement players
        hitters = player_total_values_df[(player_total_values_df["is_pitcher"] == False) & (player_total_values_df["var"] > 0)].copy()
        pitchers = player_total_values_df[(player_total_values_df["is_pitcher"] == True) & (player_total_values_df["var"] > 0)].copy()

        hitter_budget = self.league.budget_total * self.league.team_count * (self.league.hitter_budget_pct / 100.0)
        pitcher_budget = self.league.budget_total * self.league.team_count * (self.league.pitcher_budget_pct / 100.0)

        hitters_var_sum = float(hitters["var"].sum()) if not hitters.empty else 1.0
        pitchers_var_sum = float(pitchers["var"].sum()) if not pitchers.empty else 1.0

        # $ allocation proportional to VAR
        player_total_values_df["est_auction_value"] = 0.0
        player_total_values_df.loc[hitters.index, "est_auction_value"] = (hitters["var"] / hitters_var_sum) * hitter_budget
        player_total_values_df.loc[pitchers.index, "est_auction_value"] = (pitchers["var"] / pitchers_var_sum) * pitcher_budget

        # Enforce minimum $1 for any player we give a price to
        player_total_values_df["est_auction_value"] = player_total_values_df["est_auction_value"].apply(lambda x: float(max(x, self.MIN_DOLLAR_VALUE)) if x > 0 else 0.0)

        # Max auction value (ceiling): simple variance proxy using total_value spread
        # You can replace this later with reliability.
        # MVP: ceiling = est * (1 + 0.35) for low-ish value players, tapering for elites.
        # Here we use a gentle function of percentile rank.
        pct = player_total_values_df["total_value"].rank(pct=True).fillna(0.5)
        # elites (pct ~1) => multiplier ~1.10; low (pct ~0) => ~1.35
        mult = 1.35 - (0.25 * pct)
        player_total_values_df["est_max_auction_value"] = (player_total_values_df["est_auction_value"] * mult).round(2)

        output_values_df = player_total_values_df[self.OUTPUT_COLUMNS].copy()
        return {
            "player_values_df": output_values_df,
            "player_value_components_df": player_value_components_df
        }


    def setup_player_values(self) -> Dict[str, pd.DataFrame]:
        """
            Setup player values by calculating the total value for each player.
            Returns a dict with:
            - "player_values_df": player values (with tier, reliability_score, risk_score).
            - "player_value_components_df": per-stat weighted value components with per-category tier.
        """
        hitter_extra_scores = self.hitters_stats_df[["player_pk", "reliability_score", "risk_score"]].copy()
        pitcher_extra_scores = self.pitchers_stats_df[["player_pk", "reliability_score", "risk_score"]].copy()
        all_extra_scores = pd.concat([hitter_extra_scores, pitcher_extra_scores], ignore_index=True)
        all_extra_scores = (all_extra_scores
            .groupby("player_pk", as_index=False)
            .agg({"reliability_score": "max", "risk_score": "max"}))

        player_values_df = self.all_players_df[self.BASE_COLUMNS].copy()

        player_values_df = player_values_df.merge(all_extra_scores, on="player_pk", how="left")
        player_values_df["reliability_score"] = player_values_df["reliability_score"].fillna(0).astype(int)
        player_values_df["risk_score"] = player_values_df["risk_score"].fillna(100).astype(int)

        calculated_values = self.calculator.calculate_player_values()
        player_value_components_df = calculated_values["weighted_values_per_stat_df"]
        player_total_values_df = calculated_values["total_values_df"]

        player_values_df = player_values_df.merge(player_total_values_df, on="player_pk", how="inner")
        player_values_df = player_values_df.sort_values("total_value", ascending=False).reset_index(drop=True)

        # Tiers are computed separately for hitters and pitchers (each group gets 1, 2, 3, ...)
        player_values_df["tier"] = 0
        hitters = player_values_df[player_values_df["position"] == "B"]
        pitchers = player_values_df[player_values_df["position"] == "P"]
        if not hitters.empty:
            hitters_sorted = hitters.sort_values("total_value", ascending=False)
            player_values_df.loc[hitters_sorted.index, "tier"] = self.calculate_tiers(hitters_sorted["total_value"])
        if not pitchers.empty:
            pitchers_sorted = pitchers.sort_values("total_value", ascending=False)
            player_values_df.loc[pitchers_sorted.index, "tier"] = self.calculate_tiers(pitchers_sorted["total_value"])

        return {
            "player_values_df": player_values_df,
            "player_value_components_df": player_value_components_df
        }

    def derive_slot_code(self, row: pd.Series) -> str:
        """Map roster row to a single slot_code: use selected_position if set, else first eligible or UTIL/P."""
        slots = self.get_eligible_slot_codes(row)
        return slots[0] if slots else ("UTIL" if row.get("position") == "B" else "P")

    def get_eligible_slot_codes(self, row: pd.Series) -> List[str]:
        """
        Return all slot_codes this player counts toward, from eligible_positions (is_* flags).
        Ignores selected_position (daily lineup slot); multi-eligible players are counted in every eligible column.
        """
        pos = row.get("position")
        if pos == "P":
            slots = []
            if row.get("is_sp") == 1:
                slots.append("SP")
            if row.get("is_rp") == 1:
                slots.append("RP")
            slots.append("P")
            return slots if slots else ["P"]

        # Batter: use is_c, is_1b, is_2b, is_3b, is_ss, is_of; all batters count for UTIL
        slots = []
        if row.get("is_c") == 1:
            slots.append("C")
        if row.get("is_1b") == 1:
            slots.append("1B")
        if row.get("is_2b") == 1:
            slots.append("2B")
        if row.get("is_3b") == 1:
            slots.append("3B")
        if row.get("is_ss") == 1:
            slots.append("SS")
        if row.get("is_of") == 1:
            slots.append("OF")
        slots.append("UTIL")
        return slots if slots else ["UTIL"]


    def calculate_tiers(self, values: pd.Series) -> pd.Series:
        """
            Assign tiers based on value gaps in descending-sorted values.
        """
        if values.empty:
            return pd.Series(dtype="int")

        vals = values.to_numpy()
        gaps = np.abs(np.diff(vals))  # vals is already sorted desc
        if gaps.size == 0:
            return pd.Series([1] * len(vals), index=values.index)

        median = np.median(gaps)
        median_absolute_deviation = np.median(np.abs(gaps - median)) + 1e-9
        threshold = median + self.TIER_GAP_MULT * median_absolute_deviation

        tier = 1
        tiers = [tier]
        for g in gaps:
            if g >= threshold:
                tier += 1
            tiers.append(tier)
        return pd.Series(tiers, index=values.index)

    def calculate_replacement_values_for_players(self, all_players_df: pd.DataFrame) -> Dict[str, float]:
        """
        Compute replacement total_value for each slot_code based on league-wide demand.
        Approach (MVP):
        - For each slot_code, take eligible players sorted by total_value desc,
            replacement_value = value at index demand[slot]-1 (1-indexed).
        """
        # Compute combined pitcher demand for dollar baseline
        position_demand = self.calculate_position_demand()

        pitcher_demand_total = (
            position_demand.get("SP", 0) +
            position_demand.get("RP", 0) +
            position_demand.get("P", 0)
        )

        hitter_demand_total = (
            position_demand.get("C", 0) +
            position_demand.get("1B", 0) +
            position_demand.get("2B", 0) +
            position_demand.get("3B", 0) +
            position_demand.get("SS", 0) +
            position_demand.get("OF", 0) +
            position_demand.get("UTIL", 0)
        )

        bench_total = position_demand.get("BN", 0)

        bench_hitter = int(round(bench_total * 0.60))
        bench_pitcher = bench_total - bench_hitter

        hitter_rank = hitter_demand_total + bench_hitter
        pitcher_rank = pitcher_demand_total + bench_pitcher
        
        all_hitters = all_players_df[all_players_df["position"] == "B"]
        all_pitchers = all_players_df[all_players_df["position"] == "P"]

        hitter_replacement_value = self.replacement_at_rank(all_hitters, hitter_rank)
        pitcher_replacement_value = self.replacement_at_rank(all_pitchers, pitcher_rank)
        return {
            "hitter_replacement_value": hitter_replacement_value,
            "pitcher_replacement_value": pitcher_replacement_value
        }

    # Replacement baseline for dollars: use rank = demand_total
    def replacement_at_rank(self, df: pd.DataFrame, rank: int) -> float:
        if rank <= 0:
            return 0.0
        if df.empty:
            return 0.0
        sorted_df = df.sort_values("total_value", ascending=False).reset_index(drop=True)
        idx = min(rank - 1, len(sorted_df) - 1)
        return float(sorted_df.loc[idx, "total_value"])


    def calculate_position_demand(self) -> Dict[str, float]:
        """
            Returns how many starters league-wide per slot_code (excluding IL/NA etc. if counts_toward_remaining_roster=false).
            We only use “core” slots that map to player eligibility.
        """
        slots = self.roster_slots.copy()

        # Only slots that represent draft roster requirements (excluding IL/NA and anything flagged false)
        slots = slots[slots["counts_toward_remaining_roster"] == True]

        demand = {}
        for _, row in slots.iterrows():
            position = row["slot_code"]
            count = int(row["slot_count"]) * self.league.team_count
            demand[position] = demand.get(position, 0) + count
        return demand

    def eligible_for_slot(self, players: pd.DataFrame, slot_code: str) -> pd.Series:
        """
            Boolean eligibility from players flags.
            slot_code examples: C, 1B, 2B, 3B, SS, OF, UTIL, SP, RP, P
        """
        slot = slot_code.upper()

        if slot == "C":
            return players["is_c"] == 1
        if slot == "1B":
            return players["is_1b"] == 1
        if slot == "2B":
            return players["is_2b"] == 1
        if slot == "3B":
            return players["is_3b"] == 1
        if slot == "SS":
            return players["is_ss"] == 1
        if slot == "OF":
            return players["is_of"] == 1
        if slot == "UTIL":
            return players["position"] == "B"
        if slot == "SP":
            return players["is_sp"] == 1
        if slot == "RP":
            return players["is_rp"] == 1
        if slot == "P":
            return players["position"] == "P"
