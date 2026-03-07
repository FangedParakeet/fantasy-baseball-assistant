import sys
from models.db import get_db_connection
from utils.logger import logger
from models.draft_data_loader import DraftDataLoader
from models.zscore_calculator import ZScoreCalculator
from models.player_value_calculator import PlayerValueCalculator
from models.projections import Projections
from models.risk_scorer import RiskScorer
from models.draft_data_loader import LeagueSettings, ModelConfig, CategoryConfig
from typing import List
import pandas as pd

def main(dry_run: bool = False):
    conn = None
    try:
        conn = get_db_connection()
        draft_data_loader = DraftDataLoader(conn, dry_run=dry_run)

        league: LeagueSettings = draft_data_loader.load_league_settings()
        roster_slots: pd.DataFrame = draft_data_loader.load_roster_slots_for_league(league.league_id)
        models: List[ModelConfig] = draft_data_loader.load_models_for_league(league.league_id)
        scoring_categories: List[CategoryConfig] = draft_data_loader.load_scoring_categories_for_league(league.league_id)
        players: pd.DataFrame = draft_data_loader.load_players()
        season_stats: pd.DataFrame = draft_data_loader.load_player_season_stats()

        risk_scorer = RiskScorer()
        calculators = {
            'zscore': ZScoreCalculator(scoring_categories)
        }

        for model in models:
            hitter_rolling_stats = draft_data_loader.load_player_rolling_stats(model.hitter_span_days, model.split_type, "B")
            pitcher_rolling_stats = draft_data_loader.load_player_rolling_stats(model.pitcher_span_days, model.split_type, "P")
            hitter_advanced_rolling_stats = draft_data_loader.load_player_advanced_rolling_stats(model.hitter_span_days, model.split_type, "B")
            pitcher_advanced_rolling_stats = draft_data_loader.load_player_advanced_rolling_stats(model.pitcher_span_days, model.split_type, "P")

            projections = Projections(risk_scorer, players, season_stats, model.use_season_stats, model.use_rolling_stats)
            hitter_projections = projections.get_hitter_projections(hitter_rolling_stats, hitter_advanced_rolling_stats, model.hitter_span_days)
            pitcher_projections = projections.get_pitcher_projections(pitcher_rolling_stats, pitcher_advanced_rolling_stats, model.pitcher_span_days)

            calculator = calculators.get(model.method, None)
            if not calculator:
                logger.info(f"No calculator found for model {model.name}, skipping")
                continue

            calculator.set_player_stats(hitter_projections, pitcher_projections)
            player_value_calculator = PlayerValueCalculator(calculator, league, roster_slots, players, hitter_projections, pitcher_projections)
            calculated_values = player_value_calculator.get_player_dollar_values()
            player_values_df = calculated_values["player_values_df"]
            player_value_components_df = calculated_values["player_value_components_df"]

            draft_data_loader.upsert_player_values(model.model_id, player_values_df)
            draft_data_loader.upsert_value_components(model.model_id, player_value_components_df)
            logger.info(f"Computed {len(player_values_df)} player values for model {model.name}")
            logger.info(f"Computed {len(player_value_components_df)} player value components for model {model.name}")
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