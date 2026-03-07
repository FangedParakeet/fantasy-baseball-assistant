from abc import ABC, abstractmethod
import pandas as pd
from typing import Tuple

class ValueCalculator(ABC):
    @abstractmethod
    def calculate_player_values(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Calculates the player values for the given player.
        Returns a tuple of two DataFrames:
        - The first DataFrame contains the player values per stat.
        - The second DataFrame contains the player total values.
        """
        pass

    def set_player_stats(self, hitters_stats_df: pd.DataFrame, pitchers_stats_df: pd.DataFrame):
        self.hitters_stats_df = hitters_stats_df
        self.pitchers_stats_df = pitchers_stats_df