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

from backend.app.core.config import (
    PARSER_MODEL,
    PARSER_PROVIDER,
    PARSER_MAX_TOKENS,
    get_provider_base_url,
    get_provider_api_key,
)

# ── setup clients ─────────────────────────────────────────────────────────────
deepseek_key = get_provider_api_key("deepseek")
deepseek_client = (
    OpenAI(api_key=deepseek_key, base_url=get_provider_base_url("deepseek"))
    if deepseek_key
    else None
)

nvidia_key = get_provider_api_key("nvidia")
nvidia_client = (
    OpenAI(api_key=nvidia_key, base_url=get_provider_base_url("nvidia"))
    if nvidia_key
    else None
)

vilao_key = get_provider_api_key("vilao")
vilao_client = (
    OpenAI(api_key=vilao_key, base_url=get_provider_base_url("vilao"))
    if vilao_key
    else None
)

xah_key = get_provider_api_key("xah")
xah_client = (
    OpenAI(api_key=xah_key, base_url=get_provider_base_url("xah"))
    if xah_key
    else None
)

commandcode_key = get_provider_api_key("commandcode")
commandcode_client = (
    OpenAI(api_key=commandcode_key, base_url=get_provider_base_url("commandcode"))
    if commandcode_key
    else None
)

# Alias client for test mocking compatibility
client = deepseek_client


def chat(
    prompt: Optional[str] = None,
    system: str = "You are a helpful assistant",
    model: Optional[str] = None,
    thinking: Optional[Any] = None,
    provider: Optional[str] = None,
    max_tokens: Optional[int] = None,
    messages: Optional[Any] = None,
) -> str:
    """
    Call the LLM chat API using model and provider configured in config.yaml.
    Supports either single prompt string or multi-turn messages list.
    """
    target_model = model or PARSER_MODEL
    target_provider = (provider or PARSER_PROVIDER or "xah").lower()
    target_max_tokens = max_tokens or PARSER_MAX_TOKENS

    if messages is not None:
        chat_messages = list(messages)
    else:
        chat_messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt or ""},
        ]

    kwargs = {
        "messages": chat_messages,
        "model": target_model,
        "stream": False,
    }
    if target_max_tokens:
        kwargs["max_tokens"] = target_max_tokens
    
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

    import time
    start_time = time.time()
    response = active_client.chat.completions.create(**kwargs)
    duration_sec = time.time() - start_time

    from backend.app.domains.llm.llm_logger import log_llm_call
    log_llm_call(
        messages=kwargs.get("messages", []),
        response=response,
        model=target_model,
        provider=target_provider,
        duration_sec=duration_sec
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    result = chat("Hello")
    print(result)
