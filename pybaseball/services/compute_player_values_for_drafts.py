import sys
from models.db import get_db_connection
from models.db_recorder import DB_Recorder
from utils.logger import logger
from models.player_data_loader import PlayerDataLoader
from models.zscore_calculator import ZScoreCalculator
from models.player_value_calculator import PlayerValueCalculator
from models.projections import Projections
from models.risk_scorer import RiskScorer
from models.player_data_loader import LeagueSettings, ModelConfig, CategoryConfig
from models.supply_calculator import (
    load_player_values,
    compute_supply_for_model,
    upsert_supply_tables_for_draft,
)

from typing import List
import pandas as pd

def main(dry_run: bool = False):
    conn = None
    try:
        conn = get_db_connection()
        db_recorder = DB_Recorder(conn)
        draft_data_loader = PlayerDataLoader(conn, logger, dry_run=dry_run)

        league: LeagueSettings = draft_data_loader.load_league_settings()
        roster_slots: pd.DataFrame = draft_data_loader.load_roster_slots_for_league(league.league_id)
        draft_ids: List[int] = draft_data_loader.load_drafts_for_league(league.league_id)
        models: List[ModelConfig] = draft_data_loader.load_models_for_league(league.league_id)
        scoring_categories: List[CategoryConfig] = draft_data_loader.load_scoring_categories_for_league(league.league_id)
        players: pd.DataFrame = draft_data_loader.load_players()
        season_stats: pd.DataFrame = draft_data_loader.load_player_season_stats()

        risk_scorer = RiskScorer()
        calculators = {
            'zscore': ZScoreCalculator(scoring_categories)
        }

        for model in models:
            if model.split_type != "overall":
                logger.info(f"Skipping model {model.name} with split type {model.split_type}, only overall split is supported")
                continue

            calculator = calculators.get(model.method, None)
            if not calculator:
                logger.info(f"No calculator found for model {model.name}, skipping")
                continue

            hitter_rolling_stats = draft_data_loader.load_player_rolling_stats(model.hitter_span_days, model.split_type, "B")
            pitcher_rolling_stats = draft_data_loader.load_player_rolling_stats(model.pitcher_span_days, model.split_type, "P")
            hitter_advanced_rolling_stats = draft_data_loader.load_player_advanced_rolling_stats(model.hitter_span_days, model.split_type, "B")
            pitcher_advanced_rolling_stats = draft_data_loader.load_player_advanced_rolling_stats(model.pitcher_span_days, model.split_type, "P")

            projections = Projections(risk_scorer, players, season_stats, model.use_season_stats, model.use_rolling_stats)
            hitter_projections = projections.get_hitter_projections(hitter_rolling_stats, hitter_advanced_rolling_stats, model.hitter_span_days)
            pitcher_projections = projections.get_pitcher_projections(pitcher_rolling_stats, pitcher_advanced_rolling_stats, model.pitcher_span_days)

            calculator.set_player_stats(hitter_projections, pitcher_projections)
            player_value_calculator = PlayerValueCalculator(calculator, league, roster_slots, players, hitter_projections, pitcher_projections)
            calculated_values = player_value_calculator.get_player_dollar_values()
            player_values_df = calculated_values["player_values_df"]
            player_value_components_df = calculated_values["player_value_components_df"]

            draft_data_loader.upsert_player_values(model.model_id, player_values_df)
            draft_data_loader.upsert_value_components(model.model_id, player_value_components_df)
            logger.info(f"Computed {len(player_values_df)} player values for model {model.name}")
            logger.info(f"Computed {len(player_value_components_df)} player value components for model {model.name}")

            logger.info(f"Computing supply for model {model.name}")
            player_values_df = load_player_values(db_recorder, model.model_id)
            replacement_df, supply_df, tier_supply_df = compute_supply_for_model(
                league_id=league.league_id,
                model_id=model.model_id,
                team_count=league.team_count,
                roster_slots_df=roster_slots,
                player_values_df=player_values_df,
            )
            for draft_id in draft_ids:
                upsert_supply_tables_for_draft(
                    db_recorder,
                    draft_id=draft_id,
                    model_id=model.model_id,
                    replacement_df=replacement_df,
                    supply_df=supply_df,
                    tier_supply_df=tier_supply_df,
                    dry_run=dry_run,
                )
                logger.info(f"Upserted supply tables for draft {draft_id}")


    except Exception as e:
        logger.exception(f"Error computing player values for drafts: {e}")
        raise
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    logger.info(f"Computing player values for drafts with dry_run={dry_run}")
    main(dry_run=dry_run) 