import sys
import subprocess

scripts = {
    "create_player_lookup": "services/create_player_lookup_mlb_api.py",
    "player_stats": "services/sync_player_stats.py",
    "player_advanced": "services/sync_player_advanced_stats.py",
    "player_logs": "services/sync_player_game_logs_mlb_api.py",
    "team_stats": "services/sync_team_stats.py",
    "team_logs": "services/sync_team_game_logs.py",
    "probable_pitchers": "services/sync_probable_pitchers.py",
    "all": "sync_all.py"
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py [create_player_lookup|player_stats|player_advanced|player_logs|team_stats|team_logs|probable_pitchers|all]")
        sys.exit(1)

    key = sys.argv[1]
    script = scripts.get(key)

    if not script:
        print(f"Unknown command: {key}")
        sys.exit(1)

    if key == "all":
        subprocess.run(["python", script])
    else:
        subprocess.run(["python", "-c", f"import sys; sys.path.insert(0, '.'); exec(open('{script}').read())"])
