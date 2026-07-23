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

# Model Configurations (Strictly loaded from config.yaml as single source of truth)
models_cfg = config_data.get("models", {})

ocr_cfg = models_cfg.get("ocr", {})
OCR_MODEL = ocr_cfg.get("model_name")
OCR_PROVIDER = ocr_cfg.get("provider")
OCR_BATCH_SIZE = ocr_cfg.get("batch_size", 6)
OCR_CONCURRENCY = ocr_cfg.get("concurrency", 5)

parser_cfg = models_cfg.get("parser", {})
PARSER_MODEL = parser_cfg.get("model_name")
PARSER_PROVIDER = parser_cfg.get("provider")
PARSER_THINKING = parser_cfg.get("thinking")

linker_cfg = models_cfg.get("linker", {})
LINKER_MODEL = linker_cfg.get("model_name")
LINKER_PROVIDER = linker_cfg.get("provider")

mapper_cfg = models_cfg.get("answer_mapper", {})
ANSWER_MAPPER_MODEL = mapper_cfg.get("model_name")
ANSWER_MAPPER_PROVIDER = mapper_cfg.get("provider")

# Logs Directory
LOGS_DIR = WORKSPACE_DIR / config_data.get("logging", {}).get("dir", "logs/ocr_logs")
LOGS_DIR.mkdir(parents=True, exist_ok=True)

LLM_LOGS_DIR = WORKSPACE_DIR / "logs" / "llm_logs"
LLM_LOGS_DIR.mkdir(parents=True, exist_ok=True)

