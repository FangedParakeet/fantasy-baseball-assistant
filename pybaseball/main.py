import sys
import subprocess

scripts = {
    "player_stats": "sync/sync_player_stats.py",
    "player_advanced": "sync/sync_player_advanced_stats.py",
    "player_logs": "sync/sync_player_game_logs.py",
    "team_stats": "sync/sync_team_stats.py",
    "team_logs": "sync/sync_team_game_logs.py",
    "probable_pitchers": "sync/sync_probable_pitchers.py",
    "all": "sync_all.py"
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py [player_stats|player_advanced|player_logs|team_stats|team_logs|probable_pitchers|all]")
        sys.exit(1)

    key = sys.argv[1]
    script = scripts.get(key)

    if not script:
        print(f"Unknown command: {key}")
        sys.exit(1)

    subprocess.run(["python", script])
