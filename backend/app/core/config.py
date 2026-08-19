
import yaml
import os
from pathlib import Path
from dotenv import load_dotenv

# Paths
APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent.parent
WORKSPACE_DIR = BACKEND_DIR.parent
load_dotenv(WORKSPACE_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")

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

# Providers Configuration (Loaded from config.yaml)
PROVIDERS_CFG = config_data.get("providers", {})

def get_provider_base_url(provider_name: str) -> str:
    prov = PROVIDERS_CFG.get(provider_name.lower(), {})
    return prov.get("base_url", "")

def get_provider_api_key(provider_name: str) -> str:
    prov = PROVIDERS_CFG.get(provider_name.lower(), {})
    key_env = prov.get("api_key_env")
    if key_env and os.environ.get(key_env):
        return os.environ.get(key_env)
    
    # Fallback environment variable aliases
    if provider_name == "commandcode":
        return os.environ.get("CMD_API_KEY") or os.environ.get("COMMANDCODE_API_KEY") or os.environ.get("DEEPSEEK_API_KEY") or ""
    elif provider_name == "xah":
        return os.environ.get("XAH_API_KEY") or os.environ.get("LLM_API_KEY") or ""
    elif provider_name == "nvidia":
        return os.environ.get("NVIDIA_API_KEY") or os.environ.get("DEEPSEEK_API_KEY") or ""
    elif provider_name == "vilao":
        return os.environ.get("LLM_API_KEY") or ""
    elif provider_name == "deepseek":
        return os.environ.get("DEEPSEEK_API_KEY") or ""
    elif provider_name in ["codex", "openai_codex"]:
        return os.environ.get("OPENAI_API_KEY") or ""
    return ""

# Model Configurations (Strictly loaded from config.yaml as single source of truth)
models_cfg = config_data.get("models", {})

ocr_cfg = models_cfg.get("ocr", {})
OCR_MODEL = ocr_cfg.get("model_name")
OCR_PROVIDER = ocr_cfg.get("provider")
OCR_BATCH_SIZE = ocr_cfg.get("batch_size", 6)
OCR_CONCURRENCY = ocr_cfg.get("concurrency", 5)

figure_cfg = ocr_cfg.get("figure_detection", {})
FIGURE_DETECTION_ENABLED = figure_cfg.get("enabled", True)
FIGURE_MODEL_PATH = WORKSPACE_DIR / figure_cfg.get(
    "model_path", "export_onnx/iter1-haswell-int8.onnx"
)
FIGURE_CONFIDENCE_THRESHOLD = float(figure_cfg.get("confidence_threshold", 0.3))
FIGURE_CLASS_NAMES = tuple(
    figure_cfg.get("class_names", ["bangbienthien", "class_1"])
)
FIGURE_INCLUDED_CLASS_IDS = tuple(figure_cfg.get("included_class_ids", [1]))

parser_cfg = models_cfg.get("parser", {})
PARSER_MODEL = parser_cfg.get("model_name")
PARSER_PROVIDER = parser_cfg.get("provider")
PARSER_THINKING = parser_cfg.get("thinking")
PARSER_MAX_TOKENS = parser_cfg.get("max_tokens")

linker_cfg = models_cfg.get("linker", {})
LINKER_MODEL = linker_cfg.get("model_name")
LINKER_PROVIDER = linker_cfg.get("provider")
LINKER_THINKING = linker_cfg.get("thinking")

mapper_cfg = models_cfg.get("answer_mapper", {})
ANSWER_MAPPER_MODEL = mapper_cfg.get("model_name")
ANSWER_MAPPER_PROVIDER = mapper_cfg.get("provider")

chunker_cfg = models_cfg.get("chunker", {})
CHUNKER_TARGET_TOKENS = int(chunker_cfg.get("target_tokens", 48000))
CHUNKER_MAX_TOKENS = int(chunker_cfg.get("max_tokens", 64000))
CHUNKER_OVERLAP_PAGES = int(chunker_cfg.get("overlap_pages", 1))

reviewer_cfg = models_cfg.get("reviewer", {})
REVIEWER_MODEL = reviewer_cfg.get("model_name") or PARSER_MODEL
REVIEWER_PROVIDER = reviewer_cfg.get("provider") or "deepseek"
REVIEWER_THINKING = reviewer_cfg.get("thinking") or "medium"
REVIEWER_MIN_SCORE = int(reviewer_cfg.get("min_score_threshold", 75))

# Logs Directory (Strictly inside backend/logs/)
LOGS_DIR = BACKEND_DIR / "logs" / "ocr_logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

LLM_LOGS_DIR = BACKEND_DIR / "logs" / "llm_logs"
LLM_LOGS_DIR.mkdir(parents=True, exist_ok=True)
