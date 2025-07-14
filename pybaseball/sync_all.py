import subprocess
from utils.sync_status import update_sync_status

SCRIPTS = [
    "sync_player_stats.py",
    "sync_player_advanced_stats.py",
    "sync_player_game_logs.py",
    "sync_team_stats.py",
    "sync_team_game_logs.py",
    "sync_probable_pitchers.py"
]

def main():
    for script in SCRIPTS:
        try:
            subprocess.run(["python", f"pybaseball/services/{script}"], check=True)
        except Exception as e:
            update_sync_status(script, "error", str(e))

if __name__ == "__main__":
    main()
