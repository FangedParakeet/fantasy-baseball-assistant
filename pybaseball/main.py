import sys
import subprocess

scripts = {
    "game_logs": "services/sync_game_logs.py",
    "probable_pitchers": "services/sync_probable_pitchers.py",
    "compute_stats": "services/compute_stats_from_game_logs.py",
    "season_stats": "services/sync_season_stats.py",
    "yahoo_player_data": "services/sync_yahoo_player_data.py",
    "all": "sync_all.py"
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py [game_logs|probable_pitchers|compute_stats|season_stats|yahoo_player_data|all] [--force]")
        sys.exit(1)

    key = sys.argv[1]
    script = scripts.get(key)

    if not script:
        print(f"Unknown command: {key}")
        sys.exit(1)

    if key == "all":
        # Pass all arguments after "all" to sync_all.py
        args = sys.argv[2:] if len(sys.argv) > 2 else []
        subprocess.run(["python", script] + args)
    else:
        # Pass all arguments after the script name
        args = sys.argv[2:] if len(sys.argv) > 2 else []
        subprocess.run(["python", "-c", f"import sys; sys.argv = ['{script}'] + {args}; sys.path.insert(0, '.'); exec(open('{script}').read())"])
