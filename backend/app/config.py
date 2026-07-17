import yaml
from pathlib import Path

# Paths
APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
WORKSPACE_DIR = BACKEND_DIR.parent
DB_FILE = BACKEND_DIR / "db.json"
TMP_DIR = WORKSPACE_DIR / "tmp"
CONFIG_YAML_FILE = BACKEND_DIR / "config.yaml"

# Load YAML configuration
def load_config():
    if CONFIG_YAML_FILE.exists():
        with open(CONFIG_YAML_FILE, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}

config_data = load_config()

# Model Configurations
OCR_MODEL = config_data.get("models", {}).get("ocr", {}).get("model_name", "mainnewnol/Minimax-M3")
OCR_BATCH_SIZE = config_data.get("models", {}).get("ocr", {}).get("batch_size", 3)
OCR_CONCURRENCY = config_data.get("models", {}).get("ocr", {}).get("concurrency", 5)
PARSER_MODEL = config_data.get("models", {}).get("parser", {}).get("model_name", "mainnewnol/deepseek-v4-pro")
PARSER_THINKING = config_data.get("models", {}).get("parser", {}).get("thinking", "enabled")
ANSWER_MAPPER_MODEL = config_data.get("models", {}).get("answer_mapper", {}).get("model_name", "mainnewnol/Minimax-M3")
ANSWER_MAPPER_PROVIDER = config_data.get("models", {}).get("answer_mapper", {}).get("provider", "xah")

# Logs Directory
LOGS_DIR = WORKSPACE_DIR / config_data.get("logging", {}).get("dir", "ocr_logs")
LOGS_DIR.mkdir(parents=True, exist_ok=True)

