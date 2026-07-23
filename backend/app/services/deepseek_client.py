import os
from typing import Optional, Any
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

try:
    from src.token_tracker import log_response
except ImportError:
    def log_response(response, model=""):
        pass

# Locate .env by searching up directory hierarchy
current_dir = Path(__file__).resolve().parent
env_path = None
for p in [current_dir] + list(current_dir.parents):
    if (p / ".env").exists():
        env_path = p / ".env"
        break

if env_path:
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# ── setup clients ─────────────────────────────────────────────────────────────
deepseek_client = None
if os.environ.get("DEEPSEEK_API_KEY"):
    deepseek_client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com",
    )

nvidia_client = None
if os.environ.get("NVIDIA_API_KEY") or os.environ.get("DEEPSEEK_API_KEY"):
    nvidia_client = OpenAI(
        api_key=os.environ.get("NVIDIA_API_KEY") or os.environ.get("DEEPSEEK_API_KEY"),
        base_url="https://integrate.api.nvidia.com/v1",
    )

vilao_client = None
if os.environ.get("LLM_API_KEY"):
    vilao_client = OpenAI(
        api_key=os.environ.get("LLM_API_KEY"),
        base_url="https://api.vilao.ai/v1",
    )

xah_client = None
if os.environ.get("XAH_API_KEY") or os.environ.get("LLM_API_KEY"):
    xah_client = OpenAI(
        api_key=os.environ.get("XAH_API_KEY") or os.environ.get("LLM_API_KEY"),
        base_url="https://api.xah.io/v1",
    )

commandcode_client = None
if os.environ.get("CMD_API_KEY") or os.environ.get("COMMANDCODE_API_KEY") or os.environ.get("DEEPSEEK_API_KEY"):
    commandcode_client = OpenAI(
        api_key=os.environ.get("CMD_API_KEY") or os.environ.get("COMMANDCODE_API_KEY") or os.environ.get("DEEPSEEK_API_KEY"),
        base_url="https://api.commandcode.ai/provider/v1",
    )

from backend.app.config import PARSER_MODEL, PARSER_PROVIDER

# Alias client for test mocking compatibility
client = deepseek_client


def chat(
    prompt: str,
    system: str = "You are a helpful assistant",
    model: Optional[str] = None,
    thinking: Optional[Any] = None,
    provider: Optional[str] = None,
) -> str:
    """
    Call the LLM chat API using model and provider configured in config.yaml.
    """
    target_model = model or PARSER_MODEL
    target_provider = (provider or PARSER_PROVIDER or "xah").lower()

    kwargs = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "model": target_model,
        "stream": False,
    }
    
    if target_provider == "nvidia":
        if nvidia_client is None:
            raise ValueError("Error: Provider requires NVIDIA_API_KEY but it is not set.")
        active_client = nvidia_client
        thinking_bool = False
        if thinking is True or (isinstance(thinking, str) and thinking in ["high", "max"]):
            thinking_bool = True
        elif thinking is None:
            thinking_bool = True
        kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": thinking_bool}}
        
    elif target_provider == "xah":
        if xah_client is None:
            raise ValueError("Error: Model routes to Xah.io but neither XAH_API_KEY nor LLM_API_KEY is set.")
        active_client = xah_client

    elif target_provider == "vilao":
        if vilao_client is None:
            raise ValueError("Error: Model routes to Vilao.ai but LLM_API_KEY is not set.")
        active_client = vilao_client

    elif target_provider == "commandcode":
        if commandcode_client is None:
            raise ValueError("Error: Model routes to CommandCode but neither CMD_API_KEY nor COMMANDCODE_API_KEY is set.")
        active_client = commandcode_client
            
    else:
        if deepseek_client is None:
            raise ValueError("Error: DEEPSEEK_API_KEY is not set.")
        active_client = deepseek_client
        kwargs["model"] = model
        
        effort = None
        if thinking is True:
            effort = "high"
        elif isinstance(thinking, str) and thinking in ["high", "max"]:
            effort = thinking
        elif thinking is None:
            if "pro" in model or "reasoner" in model:
                effort = "high"

        if effort is not None:
            kwargs["reasoning_effort"] = effort

    response = active_client.chat.completions.create(**kwargs)
    log_response(response, model=model)

    return response.choices[0].message.content


if __name__ == "__main__":
    result = chat("Hello")
    print(result)
