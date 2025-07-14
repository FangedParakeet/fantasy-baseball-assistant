import logging
from pathlib import Path

log_path = Path(__file__).resolve().parent.parent / "logs"
log_path.mkdir(parents=True, exist_ok=True)
log_file = log_path / "sync.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()  # Optional: also print to console
    ]
)

logger = logging.getLogger("pybaseball-sync")
