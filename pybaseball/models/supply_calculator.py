import pandas as pd
import numpy as np
from typing import Dict, Tuple

CORE_SLOTS = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL", "SP", "RP", "P"]


def position_demand(roster_slots_df: pd.DataFrame, team_count: int) -> Dict[str, int]:
    """
    league-wide demand per slot code for draft roster (starter + util + etc).
    BN/IL/NA should be excluded by not being in CORE_SLOTS, and/or by counts flag.
    """
    df = roster_slots_df.copy()
    df = df[df["counts_toward_remaining_roster"] == True]  # noqa
    demand: Dict[str, int] = {}
    for _, row in df.iterrows():
        slot = str(row["slot_code"]).upper()
        count = int(row["slot_count"]) * team_count
        demand[slot] = demand.get(slot, 0) + count
    return demand


def load_player_values(rec, model_id: int) -> pd.DataFrame:
    """
    Returns a frame with:
      player_pk, position(B/P), tier, total_value, est_auction_value,
      plus eligibility flags is_* for slot filtering.
    """
    rows = rec.get_query(
        """
        SELECT
          v.player_pk,
          p.position,
          v.tier,
          v.total_value,
          v.est_auction_value,

          p.is_c, p.is_1b, p.is_2b, p.is_3b, p.is_ss, p.is_of, p.is_util, p.is_sp, p.is_rp
        FROM draft_player_values v
        JOIN players p ON p.id = v.player_pk
        WHERE v.model_id = %s
        """,
        (model_id,),
    )
    df = pd.DataFrame(rows)
    if df.empty:
        raise RuntimeError(f"No draft_player_values found for model_id={model_id}")
    return df


def eligible_mask(df: pd.DataFrame, slot_code: str) -> pd.Series:
    s = slot_code.upper()
    if s == "C":
        return df["is_c"] == 1
    if s == "1B":
        return df["is_1b"] == 1
    if s == "2B":
        return df["is_2b"] == 1
    if s == "3B":
        return df["is_3b"] == 1
    if s == "SS":
        return df["is_ss"] == 1
    if s == "OF":
        return df["is_of"] == 1
    if s == "UTIL":
        return df["position"] == "B"
    if s == "SP":
        return df["is_sp"] == 1
    if s == "RP":
        return df["is_rp"] == 1
    if s == "P":
        return df["position"] == "P"
    return pd.Series([False] * len(df), index=df.index)


def replacement_at_rank(eligible_df: pd.DataFrame, rank: int, value_col: str) -> float:
    """
    rank is 1-indexed. Returns value at that rank in descending order.
    If not enough players, returns last available player's value.
    """
    if eligible_df.empty or rank <= 0:
        return 0.0
    sorted_df = eligible_df.sort_values(value_col, ascending=False).reset_index(drop=True)
    idx = min(rank - 1, len(sorted_df) - 1)
    return float(sorted_df.loc[idx, value_col])


def compute_supply_for_model(
    *,
    league_id: int,
    model_id: int,
    team_count: int,
    roster_slots_df: pd.DataFrame,
    player_values_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Returns three dataframes (NOT including draft_id yet):
      - replacement_df: slot_code, replacement_value, replacement_price
      - supply_df: slot_code, remaining_above_replacement, slots_remaining_league, scarcity_index
      - tier_supply_df: slot_code, tier, remaining_count
    """
    demand = position_demand(roster_slots_df, team_count)

    # Restrict to draft-relevant demand keys
    # (if a slot isn't configured, its demand is 0 and we skip)
    repl_rows = []
    supply_rows = []
    tier_rows = []

    for slot in CORE_SLOTS:
        slot_demand = int(demand.get(slot, 0))
        if slot_demand <= 0:
            continue

        elig = player_values_df[eligible_mask(player_values_df, slot)].copy()

        priced = int((elig["est_auction_value"].astype(float) >= 1.0).sum())
        slots_remaining = slot_demand
        scarcity = float(priced / slots_remaining) if slots_remaining > 0 else 0.0

        supply_rows.append({
            "slot_code": slot,
            "remaining_above_replacement": priced,
            "slots_remaining_league": slots_remaining,
            "scarcity_index": scarcity,
        })
        # Tier supply
        if not elig.empty:
            tier_counts = elig.groupby("tier").size().reset_index(name="remaining_count")
            for _, tr in tier_counts.iterrows():
                t = tr["tier"]
                if pd.isna(t):
                    continue
                tier_rows.append({
                    "slot_code": slot,
                    "tier": int(t),
                    "remaining_count": int(tr["remaining_count"]),
                })

    replacement_df = pd.DataFrame(repl_rows)
    supply_df = pd.DataFrame(supply_rows)
    tier_supply_df = pd.DataFrame(tier_rows)

    return replacement_df, supply_df, tier_supply_df


def upsert_supply_tables_for_draft(
    rec,
    *,
    draft_id: int,
    model_id: int,
    replacement_df: pd.DataFrame,
    supply_df: pd.DataFrame,
    tier_supply_df: pd.DataFrame,
    dry_run: bool = False
) -> None:
    # 1) replacement
    repl_sql = """
    INSERT INTO draft_position_replacement
      (draft_id, model_id, slot_code, replacement_value, replacement_price, updated_at)
    VALUES
      (%s, %s, %s, %s, %s, NOW())
    ON DUPLICATE KEY UPDATE
      replacement_value = VALUES(replacement_value),
      replacement_price = VALUES(replacement_price),
      updated_at = NOW()
    """
    repl_rows = [
        (draft_id, model_id, r["slot_code"], float(r["replacement_value"]), float(r["replacement_price"]))
        for _, r in replacement_df.iterrows()
    ]

    # 2) supply
    supply_sql = """
    INSERT INTO draft_position_supply
      (draft_id, model_id, slot_code, remaining_above_replacement, slots_remaining_league, scarcity_index, updated_at)
    VALUES
      (%s, %s, %s, %s, %s, %s, NOW())
    ON DUPLICATE KEY UPDATE
      remaining_above_replacement = VALUES(remaining_above_replacement),
      slots_remaining_league = VALUES(slots_remaining_league),
      scarcity_index = VALUES(scarcity_index),
      updated_at = NOW()
    """
    supply_rows = [
        (
            draft_id, model_id, r["slot_code"],
            int(r["remaining_above_replacement"]),
            int(r["slots_remaining_league"]),
            float(r["scarcity_index"]),
        )
        for _, r in supply_df.iterrows()
    ]

    # 3) tier supply
    tier_sql = """
    INSERT INTO draft_tier_supply
      (draft_id, model_id, slot_code, tier, remaining_count, updated_at)
    VALUES
      (%s, %s, %s, %s, %s, NOW())
    ON DUPLICATE KEY UPDATE
      remaining_count = VALUES(remaining_count),
      updated_at = NOW()
    """
    tier_rows = [
        (draft_id, model_id, r["slot_code"], int(r["tier"]), int(r["remaining_count"]))
        for _, r in tier_supply_df.iterrows()
    ]

    if dry_run:
        print(f"[dry-run] draft_id={draft_id} model_id={model_id} repl={len(repl_rows)} supply={len(supply_rows)} tier={len(tier_rows)}")
        return

    # Optional: wipe old tier rows for this draft/model to avoid stale tiers if tier assignment changes
    rec.execute_query(
        "DELETE FROM draft_tier_supply WHERE draft_id=%s AND model_id=%s",
        (draft_id, model_id)
    )

    rec.batch_upsert(repl_sql, repl_rows)
    rec.batch_upsert(supply_sql, supply_rows)
    rec.batch_upsert(tier_sql, tier_rows)