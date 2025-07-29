import subprocess
import sys
from utils.sync_status import update_sync_status

SCRIPTS = [
    "create_player_lookup.py",
    "sync_probable_pitchers.py",
    "sync_game_logs.py",
    "hydrate_player_data.py",
]

def main():
    # Parse command line arguments
    force_flag = "--force" in sys.argv
    
    for script in SCRIPTS:
        try:
            # Build the command - only pass --force to hydrate_player_data.py
            cmd = ["python", "-c", f"import sys; sys.path.insert(0, '.'); exec(open('services/{script}').read())"]
            if force_flag and script == "hydrate_player_data.py":
                cmd.extend(["--force"])
            
            subprocess.run(cmd, check=True, cwd="/usr/src/pybaseball")
        except Exception as e:
            update_sync_status(script, "error", str(e))

if __name__ == "__main__":
    main()
