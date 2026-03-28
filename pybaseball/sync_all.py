import subprocess
import sys
import argparse
from utils.sync_status import update_sync_status
from utils.constants import CURRENT_SEASON

SCRIPTS = [
    "sync_game_logs.py",
    "compute_stats_from_game_logs.py",
    "sync_season_stats.py",
    "sync_probable_pitchers.py",
    "sync_yahoo_player_data.py",
    "compute_player_value_snapshots.py",
]

# Scripts that accept --season argument
SEASON_FLAG_SCRIPTS = [
    "sync_game_logs.py",
    "compute_stats_from_game_logs.py",
    "sync_season_stats.py",
    "compute_player_value_snapshots.py",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Run all sync scripts.")
    parser.add_argument("--force", action="store_true", default=False, help="Force re-hydration of player data.")
    parser.add_argument(
        "--season",
        type=int,
        metavar="YEAR",
        default=CURRENT_SEASON,
        help=f"Season year to sync (default: {CURRENT_SEASON}).",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    force_flag = args.force
    season_year = args.season

    for script in SCRIPTS:
        try:
            # Build the command - only pass --force to compute_stats_from_game_logs.py
            cmd = ["python", "-c", f"import sys; sys.path.insert(0, '.'); exec(open('services/{script}').read())"]
            force_flag_scripts = [
                "sync_probable_pitchers.py",
                "compute_stats_from_game_logs.py",
                "sync_yahoo_player_data.py",
                "compute_player_value_snapshots.py",
            ]
            if (force_flag and script in force_flag_scripts):
                cmd.extend(["--force"])
            if script in SEASON_FLAG_SCRIPTS:
                cmd.extend(["--season", str(season_year)])

            subprocess.run(cmd, check=True, cwd="/usr/src/pybaseball")
        except Exception as e:
            update_sync_status(script, "error", str(e))

if __name__ == "__main__":
    main()
