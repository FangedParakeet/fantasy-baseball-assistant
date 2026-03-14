import sys
import pandas as pd
from datetime import date
from typing import List

from models.db import get_db_connection
from utils.logger import logger
from utils.constants import SPLITS, ROLLING_WINDOWS

from models.player_data_loader import PlayerDataLoader, LeagueSettings, ModelConfig, CategoryConfig
from models.zscore_calculator import ZScoreCalculator
from models.projections import Projections
from models.risk_scorer import RiskScorer
from models.player_value_calculator import PlayerValueCalculator

def main(dry_run: bool = False):
    conn = None
    try:
        conn = get_db_connection()
        loader = PlayerDataLoader(conn, logger, dry_run=dry_run)

        league: LeagueSettings = loader.load_league_settings()
        models: List[ModelConfig] = loader.load_models_for_league(league.league_id)
        scoring_categories: List[CategoryConfig] = loader.load_scoring_categories_for_league(league.league_id)
        players: pd.DataFrame = loader.load_players()
        season_stats: pd.DataFrame = loader.load_player_season_stats()

        risk_scorer = RiskScorer()
        calculators = {
            "zscore": ZScoreCalculator(scoring_categories)
        }

        as_of = date.today()
        spans = ROLLING_WINDOWS + [0]
        
        roster_df = loader.load_roster_with_teams()

        for model in models:
            calculator = calculators.get(model.method, None)
            if not calculator:
                logger.info(f"No calculator for model {model.name}, skipping")
                continue

            projections = Projections(risk_scorer, players, season_stats, model.use_season_stats, model.use_rolling_stats)

            for span in spans:
                split_list = ["overall"] if span == 0 else SPLITS

                for split in split_list:
                    # Load rolling slices if needed
                    if span == 0:
                        # No rolling tables used
                        hitter_rolling_basic = pd.DataFrame()
                        pitcher_rolling_basic = pd.DataFrame()
                        hitter_rolling_advanced = pd.DataFrame()
                        pitcher_rolling_advanced = pd.DataFrame()
                        hitter_span = 0
                        pitcher_span = 0
                    else:
                        hitter_span = span
                        pitcher_span = span
                        try:
                            hitter_rolling_basic = loader.load_player_rolling_stats(hitter_span, split, "B")
                            pitcher_rolling_basic = loader.load_player_rolling_stats(pitcher_span, split, "P")
                            hitter_rolling_advanced = loader.load_player_advanced_rolling_stats(hitter_span, split, "B")
                            pitcher_rolling_advanced = loader.load_player_advanced_rolling_stats(pitcher_span, split, "P")
                        except Exception as e:
                            # If a split is missing, skip it.
                            logger.info(f"Skipping span={span} split={split} (missing stats): {e}")
                            continue

                    hitter_projections = projections.get_hitter_projections(hitter_rolling_basic, hitter_rolling_advanced, hitter_span)
                    pitcher_projections = projections.get_pitcher_projections(pitcher_rolling_basic, pitcher_rolling_advanced, pitcher_span)
                    
                    calculator.set_player_stats(hitter_projections, pitcher_projections)
                    player_value_calculator = PlayerValueCalculator(calculator, league, None, players, hitter_projections, pitcher_projections)
                    calculated_values = player_value_calculator.get_player_value_snapshots(roster_df)
                    player_value_totals_df = calculated_values["player_value_totals_df"]
                    player_value_components_df = calculated_values["player_value_components_df"]

                    # Persist
                    loader.upsert_snapshot_totals(as_of, model.model_id, span, split, player_value_totals_df)
                    loader.upsert_snapshot_components(as_of, model.model_id, span, split, player_value_components_df)

                    # Pre-aggregate league team totals by category and position
                    category_totals_df = calculated_values["category_totals_df"]
                    position_totals_df = calculated_values["position_totals_df"]
                    loader.upsert_team_value_snapshot_category_totals(league.league_id, model.model_id, span, split, as_of, category_totals_df)
                    loader.upsert_team_value_snapshot_position_totals(league.league_id, model.model_id, span, split, as_of, position_totals_df)

                    logger.info(
                        f"Snapshots: model={model.name} span={span} split={split} "
                        f"totals={len(player_value_totals_df)} comps={len(player_value_components_df)} "
                        f"team_cat={len(category_totals_df)} team_pos={len(position_totals_df)}"
                    )

    except Exception as e:
        logger.exception(f"Error computing player value snapshots: {e}")
        raise
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    logger.info(f"Computing player value snapshots with dry_run={dry_run}")
    main(dry_run=dry_run)