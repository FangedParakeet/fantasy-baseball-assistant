from models.db_recorder import DB_Recorder
import pandas as pd
from dataclasses import dataclass
from datetime import date
from typing import List
from logging import Logger

@dataclass
class LeagueSettings:
    league_id: int
    budget_total: int
    team_count: int
    hitter_budget_pct: float
    pitcher_budget_pct: float


@dataclass
class ModelConfig:
    model_id: int
    league_id: int
    name: str
    method: str  # zscore or sgp (we implement zscore now)
    split_type: str
    hitter_span_days: int
    pitcher_span_days: int
    use_season_stats: bool
    use_rolling_stats: bool

@dataclass
class CategoryConfig:
    code: str
    group: str  # hitter/pitcher
    weight: float


class PlayerDataLoader(DB_Recorder):
    PLAYERS_TABLE = "players"
    PLAYERS_COLUMNS = [
        "id AS player_pk", 
        "player_id AS mlb_player_id", 
        "normalised_name AS name", 
        "mlb_team", 
        "position", 
        "status", 
        "is_c", 
        "is_1b", 
        "is_2b", 
        "is_3b", 
        "is_ss", 
        "is_of", 
        "is_util", 
        "is_sp", 
        "is_rp"
    ]
    KEEPERS_TABLE = "draft_keepers"
    KEEPERS_COLUMNS = [
        'draft_team_id',
        'player_pk',
        'cost',
        'locked_slot_code'
    ]
    PLAYER_SEASON_STATS_TABLE = "player_season_stats"
    PLAYER_SEASON_STATS_COLUMNS = [
        "player_id AS mlb_player_id",
        "position AS position",
        "games",
        "ab",
        "pa",
        "hits",
        "hr",
        "rbi",
        "runs",
        "sb",
        "avg",
        "ops",
        "k_rate",
        "bb_rate",
        "iso",
        "ip",
        "k_per_9",
        "era",
        "whip",
        "qs",
        "sv",
        "hld",
        "bb_per_9",
        "hr_per_9",
        "swinging_strike_pct"
    ]
    PLAYER_ROLLING_STATS_TABLE = "player_rolling_stats"
    PLAYER_ROLLING_STATS_COLUMNS = [
        "player_id AS mlb_player_id",
        "position",
        "span_days",
        "split_type",
        "games",
        "abs",
        "hits",
        "runs",
        "rbi",
        "hr",
        "sb",
        "avg",
        "ip",
        "strikeouts",
        "era",
        "whip",
        "qs",
        "sv",
        "hld"
    ]
    PLAYER_ADVANCED_ROLLING_STATS_TABLE = "player_advanced_rolling_stats"
    PLAYER_ADVANCED_ROLLING_STATS_COLUMNS = [
        "player_id AS mlb_player_id",
        "position",
        "span_days",
        "split_type",
        "games",
        "abs",
        "ip",
        "ops",
        "k_rate",
        "bb_rate",
        "iso",
        "bb_per_9",
        "hr_per_9",
        "k_bb_ratio"
    ]
    LEAGUES_TABLE = "leagues"
    LEAGUE_SETTINGS_TABLE = "league_settings"
    MODELS_TABLE = "draft_value_models"
    MODELS_COLUMNS = [
        "id",
        "league_id",
        "name",
        "method",
        "split_type",
        "hitter_span_days",
        "pitcher_span_days",
        "use_season_stats",
        "use_rolling_stats",
    ]
    SCORING_CATEGORIES_TABLE = "league_scoring_categories"
    SCORING_CATEGORIES_COLUMNS = [
        "category_code",
        "category_group",
        "weight",
    ]
    ROSTER_SLOTS_TABLE = "league_roster_slots"
    ROSTER_SLOTS_COLUMNS = [
        "slot_code",
        "slot_count",
        "sort_order",
        "counts_toward_remaining_roster",
    ]
    DRAFTS_TABLE = "drafts"
    DRAFTS_COLUMNS = [
        "id",
        "league_id",
        "name",
        "is_active",
        "archived_at",
    ]

    def __init__(self, conn, logger: Logger, *, dry_run: bool = False):
        super().__init__(conn)
        self.dry_run = dry_run
        self.logger = logger

    def upsert_snapshot_totals(self, as_of: date, model_id: int, span_days: int, split_type: str, df: pd.DataFrame):
        sql = """
            INSERT INTO player_value_snapshots
                (model_id, player_pk, mlb_player_id, position, span_days, split_type, as_of_date,
                total_value, tier, reliability_score, risk_score)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                total_value=VALUES(total_value),
                tier=VALUES(tier),
                reliability_score=VALUES(reliability_score),
                risk_score=VALUES(risk_score)
        """
        rows = []
        for _, r in df.iterrows():
            rows.append((
                model_id,
                int(r["player_pk"]),
                int(r["mlb_player_id"]),
                str(r["position"]),
                int(span_days),
                str(split_type),
                as_of,
                float(r["total_value"]),
                int(r["tier"]) if not pd.isna(r["tier"]) else None,
                int(r["reliability_score"]) if "reliability_score" in r and not pd.isna(r["reliability_score"]) else None,
                int(r["risk_score"]) if "risk_score" in r and not pd.isna(r["risk_score"]) else None,
            ))
        if self.dry_run:
            self.logger.info(f"[dry-run] Would upsert {len(rows)} totals rows for model={model_id} span={span_days} split={split_type}")
            return
        self.batch_upsert(sql, rows)


    def upsert_snapshot_components(self, as_of: date, model_id: int, span_days: int, split_type: str, comp_df: pd.DataFrame):
        sql = """
            INSERT INTO player_value_snapshot_components
                (model_id, player_pk, span_days, split_type, as_of_date,
                category_code, projection_value, zscore, weighted_value, tier)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                projection_value=VALUES(projection_value),
                zscore=VALUES(zscore),
                weighted_value=VALUES(weighted_value),
                tier=VALUES(tier)
        """
        rows = []
        for _, r in comp_df.iterrows():
            rows.append((
                model_id,
                int(r["player_pk"]),
                int(span_days),
                str(split_type),
                as_of,
                str(r["category_code"]),
                float(r["projection_value"]) if not pd.isna(r.get("projection_value")) else None,
                float(r["zscore"]) if not pd.isna(r.get("zscore")) else None,
                float(r["weighted_value"]),
                int(r["tier"]) if "tier" in r and not pd.isna(r["tier"]) else None,
            ))
        if self.dry_run:
            self.logger.info(f"[dry-run] Would upsert {len(rows)} component rows for model={model_id} span={span_days} split={split_type}")
            return
        self.batch_upsert(sql, rows)


    def upsert_player_values(self, model_id: int, player_values_df: pd.DataFrame) -> None:
        """
        Writes draft_player_values with ON DUPLICATE KEY UPDATE.
        Expects df columns: player_pk,total_value,est_auction_value,est_max_auction_value,tier,reliability_score,risk_score
        """
        as_of_date = date.today()
        insert_sql = """
            INSERT INTO draft_player_values
                (model_id, player_pk, as_of_date, total_value, est_auction_value, est_max_auction_value,
                tier, reliability_score, risk_score)
            VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                as_of_date = VALUES(as_of_date),
                total_value = VALUES(total_value),
                est_auction_value = VALUES(est_auction_value),
                est_max_auction_value = VALUES(est_max_auction_value),
                tier = VALUES(tier),
                reliability_score = VALUES(reliability_score),
                risk_score = VALUES(risk_score)
        """

        rows = []
        for _, r in player_values_df.iterrows():
            rows.append((
                model_id,
                int(r["player_pk"]),
                as_of_date,
                float(r["total_value"]),
                float(r["est_auction_value"]),
                float(r["est_max_auction_value"]),
                int(r["tier"]) if not pd.isna(r["tier"]) else None,
                int(r["reliability_score"]) if "reliability_score" in r and not pd.isna(r["reliability_score"]) else None,
                int(r["risk_score"]) if "risk_score" in r and not pd.isna(r["risk_score"]) else None,
            ))

        if self.dry_run:
            print(f"[dry-run] Would upsert {len(rows)} rows into draft_player_values for model_id={model_id}")
            return

        self.batch_upsert(insert_sql, rows)


    def upsert_value_components(self, model_id: int, player_values_per_stat_df: pd.DataFrame) -> None:
        """
        Writes draft_player_value_components.
        """
        insert_sql = """
            INSERT INTO draft_player_value_components
                (model_id, player_pk, category_code, projection_value, zscore, weighted_value)
            VALUES
            (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                projection_value = VALUES(projection_value),
                zscore = VALUES(zscore),
                weighted_value = VALUES(weighted_value)
        """

        rows = []
        for _, r in player_values_per_stat_df.iterrows():
            rows.append((
                model_id,
                int(r["player_pk"]),
                str(r["category_code"]),
                float(r["projection_value"]) if not pd.isna(r["projection_value"]) else None,
                float(r["zscore"]) if not pd.isna(r["zscore"]) else None,
                float(r["weighted_value"]),
            ))

        if self.dry_run:
            print(f"[dry-run] Would upsert {len(rows)} rows into draft_player_value_components for model_id={model_id}")
            return

        self.batch_upsert(insert_sql, rows)


    def load_league_settings(self) -> LeagueSettings:
        league = self.get_one(self.LEAGUES_TABLE)
        if not league:
            raise ValueError("No leagues found")
        league_settings = self.get_one(self.LEAGUE_SETTINGS_TABLE, conditions=[f"league_id = {league['id']}"])
        if not league_settings:
            raise ValueError("No league settings found")
        return LeagueSettings(
            league_id=int(league["id"]),
            budget_total=int(league_settings["budget_total"]),
            team_count=int(league_settings["team_count"]),
            hitter_budget_pct=float(league_settings["hitter_budget_pct"]),
            pitcher_budget_pct=float(league_settings["pitcher_budget_pct"]),
        )

    def load_models_for_league(self, league_id: int) -> List[ModelConfig]:
        models = self.get_records_with_conditions(
            self.MODELS_TABLE, 
            fields=self.MODELS_COLUMNS, 
            conditions=[f"league_id = {league_id}"]
        )
        if not models:
            raise ValueError("No models found")
        return [self.model_to_config(model) for model in models]

    def load_scoring_categories_for_league(self, league_id: int) -> List[CategoryConfig]:
        scoring_categories = self.get_records_with_conditions(
            self.SCORING_CATEGORIES_TABLE, 
            fields=self.SCORING_CATEGORIES_COLUMNS, 
            conditions=[f"league_id = {league_id}", "is_enabled = TRUE"],
            order_by=["sort_order ASC"]
        )
        if not scoring_categories:
            raise ValueError("No scoring categories found")
        return [self.scoring_category_to_config(scoring_category) for scoring_category in scoring_categories]

    def load_roster_slots_for_league(self, league_id: int) -> pd.DataFrame:
        roster_slots = self.get_records_with_conditions(
            self.ROSTER_SLOTS_TABLE,
            fields=self.ROSTER_SLOTS_COLUMNS,
            conditions=[f"league_id = {league_id}"],
            order_by=["sort_order ASC"]
        )
        if not roster_slots:
            raise ValueError("No roster slots found")
        return pd.DataFrame(roster_slots)

    def load_drafts_for_league(self, league_id: int) -> List[int]:
        drafts = self.get_records_with_conditions(
            self.DRAFTS_TABLE,
            fields=self.DRAFTS_COLUMNS,
            conditions=[f"league_id = {league_id}", "archived_at IS NULL"]
        )
        if not drafts:
            raise ValueError("No drafts found")
        return [int(draft["id"]) for draft in drafts]

    def load_players(self) -> pd.DataFrame:
        players = self.get_records_with_conditions(
            self.PLAYERS_TABLE, 
            fields=self.PLAYERS_COLUMNS,
            conditions=[f"player_id IS NOT NULL"]
        )
        players_df = pd.DataFrame(players)
        if players_df.empty:
            raise ValueError("No players found")
        return players_df

    def load_player_season_stats(self) -> pd.DataFrame:
        player_season_stats = self.get_records_with_conditions(
            self.PLAYER_SEASON_STATS_TABLE, 
            fields=self.PLAYER_SEASON_STATS_COLUMNS
        )
        player_season_stats_df = pd.DataFrame(player_season_stats)
        if player_season_stats_df.empty:
            raise ValueError("No player season stats found")
        return player_season_stats_df

    def load_player_rolling_stats(self, span_days: int, split_type: str, position: str) -> pd.DataFrame:
        player_rolling_stats = self.get_records_with_conditions(
            self.PLAYER_ROLLING_STATS_TABLE, 
            fields=self.PLAYER_ROLLING_STATS_COLUMNS,
            conditions=[f"span_days = {span_days}", f"split_type = '{split_type}'", f"position = '{position}'"]
        )
        player_rolling_stats_df = pd.DataFrame(player_rolling_stats)
        if player_rolling_stats_df.empty:
            raise ValueError("No player rolling stats found")
        return player_rolling_stats_df

    def load_player_advanced_rolling_stats(self, span_days: int, split_type: str, position: str) -> pd.DataFrame:
        player_advanced_rolling_stats = self.get_records_with_conditions(
            self.PLAYER_ADVANCED_ROLLING_STATS_TABLE, 
            fields=self.PLAYER_ADVANCED_ROLLING_STATS_COLUMNS,
            conditions=[f"span_days = {span_days}", f"split_type = '{split_type}'", f"position = '{position}'"]
        )
        player_advanced_rolling_stats_df = pd.DataFrame(player_advanced_rolling_stats)
        if player_advanced_rolling_stats_df.empty:
            raise ValueError("No player advanced rolling stats found")
        return player_advanced_rolling_stats_df

    def model_to_config(self, model: dict) -> ModelConfig:
        return ModelConfig(
            model_id=int(model["id"]),
            league_id=int(model["league_id"]),
            name=str(model["name"]),
            method=str(model["method"]),
            split_type=str(model["split_type"]),
            hitter_span_days=int(model["hitter_span_days"]),
            pitcher_span_days=int(model["pitcher_span_days"]),
            use_season_stats=bool(model["use_season_stats"]),
            use_rolling_stats=bool(model["use_rolling_stats"]),
        )

    def scoring_category_to_config(self, scoring_category: dict) -> CategoryConfig:
        return CategoryConfig(
            code=str(scoring_category["category_code"]),
            group=str(scoring_category["category_group"]),
            weight=float(scoring_category["weight"]),
        )