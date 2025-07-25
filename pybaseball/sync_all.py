import subprocess
from utils.sync_status import update_sync_status

SCRIPTS = [
    "create_player_lookup.py",
    "sync_probable_pitchers.py",
    "sync_game_logs.py",
]

def main():
    for script in SCRIPTS:
        try:
            subprocess.run(["python", "-c", f"import sys; sys.path.insert(0, '.'); exec(open('services/{script}').read())"], check=True, cwd="/usr/src/pybaseball")
        except Exception as e:
            update_sync_status(script, "error", str(e))

if __name__ == "__main__":
    main()
