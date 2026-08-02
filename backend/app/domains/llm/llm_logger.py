import os
import json
import uuid
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Define LLM logs base directory: logs/llm_logs/
WORKSPACE_DIR = Path(__file__).resolve().parent.parent.parent.parent
LLM_LOGS_DIR = WORKSPACE_DIR / "logs" / "llm_logs"


def _to_int(value: Any) -> Optional[int]:
    """Convert token-like values to int when possible."""
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return int(cleaned)
        except ValueError:
            return None
    return None


def _usage_to_dict(usage: Any) -> Dict[str, Any]:
    """
    Normalize usage-like payloads across OpenAI-like SDK/object or plain dict formats.
    """
    if usage is None:
        return {}
    if isinstance(usage, dict):
        return usage
    if hasattr(usage, "model_dump") and callable(usage.model_dump):
        try:
            dumped = usage.model_dump()
            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass
    if hasattr(usage, "dict") and callable(usage.dict):
        try:
            dumped = usage.dict()
            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass
    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
        "completion_tokens_details": getattr(usage, "completion_tokens_details", None),
    }


def _extract_usage_tokens(usage: Any) -> Dict[str, Optional[int]]:
    """Extract prompt/completion/total/reasoning token counts from usage payload."""
    usage_dict = _usage_to_dict(usage)

    prompt_tokens = _to_int(usage_dict.get("prompt_tokens"))
    completion_tokens = _to_int(usage_dict.get("completion_tokens"))
    total_tokens = _to_int(usage_dict.get("total_tokens"))

    details = usage_dict.get("completion_tokens_details")
    if details is not None and not isinstance(details, dict):
        details = _usage_to_dict(details)
    reasoning_tokens = _to_int(details.get("reasoning_tokens")) if isinstance(details, dict) else None

    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "reasoning_tokens": reasoning_tokens,
    }


def _max_or_default(current: int, candidate: Optional[int]) -> int:
    if candidate is None:
        return current
    if current == 0:
        return candidate
    return max(current, candidate)


class StreamingLLMLogger:
    """
    Live/Streaming LLM Logger that writes and periodically updates (flushes every 5s)
    logs/llm_logs/<YYYY-MM-DD>/<request>.md as stream chunks arrive.
    """
    def __init__(
        self,
        messages: List[Dict[str, Any]],
        model: str = "",
        provider: str = "",
        request_id: Optional[str] = None,
        flush_interval_sec: float = 5.0,
        start_time: Optional[float] = None,
    ):
        self.messages = messages
        self.model = model
        self.provider = provider
        self.flush_interval_sec = flush_interval_sec
        self.start_time = start_time if start_time is not None else time.time()

        today_str = datetime.now().strftime("%Y-%m-%d")
        self.day_dir = LLM_LOGS_DIR / today_str
        self.day_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        req_uuid = uuid.uuid4().hex[:8]
        if request_id:
            safe_req_id = "".join(
                c if c.isalnum() or c in ("-", "_", ".") else "_"
                for c in str(request_id)
            )
            self.req_id = safe_req_id
            self.req_filename = f"req_{self.req_id}.md"
        else:
            self.req_id = req_uuid
            self.req_filename = f"req_{timestamp_str}_{self.req_id}.md"
        self.log_file = self.day_dir / self.req_filename

        self.output_text_chunks: List[str] = []
        self.reasoning_chunks: List[str] = []
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0
        self.reasoning_tokens = 0
        self.last_flush_time = self.start_time
        self._estimated_prompt_tokens = sum(
            len(str(msg.get("content", "")).split())
            for msg in messages
            if isinstance(msg, dict) and msg.get("content") is not None
        )

        # Initial flush to create log file immediately
        self.flush(is_final=False)

    def append_chunk(
        self,
        content: Optional[str] = None,
        reasoning: Optional[str] = None,
        usage: Optional[Any] = None
    ):
        if content:
            self.output_text_chunks.append(str(content))
        if reasoning:
            self.reasoning_chunks.append(str(reasoning))

        if usage:
            usage_counts = _extract_usage_tokens(usage)
            self.prompt_tokens = _max_or_default(self.prompt_tokens, usage_counts["prompt_tokens"])
            self.completion_tokens = _max_or_default(self.completion_tokens, usage_counts["completion_tokens"])
            self.total_tokens = _max_or_default(self.total_tokens, usage_counts["total_tokens"])
            if usage_counts["reasoning_tokens"] is not None:
                self.reasoning_tokens = _max_or_default(self.reasoning_tokens, usage_counts["reasoning_tokens"])

        now = time.time()
        if now - self.last_flush_time >= self.flush_interval_sec:
            self.flush(is_final=False)

    def flush(self, is_final: bool = False):
        now = time.time()
        self.last_flush_time = now
        duration_sec = max(0.001, now - self.start_time)
        full_output = "".join(self.output_text_chunks)
        full_reasoning = "".join(self.reasoning_chunks)
        resolved_prompt_tokens = self.prompt_tokens or self._estimated_prompt_tokens
        resolved_completion_tokens = self.completion_tokens or (len(full_output.split()) if full_output else 0)
        resolved_total_tokens = self.total_tokens or (resolved_prompt_tokens + resolved_completion_tokens)
        resolved_reasoning_tokens = (
            self.reasoning_tokens
            if self.reasoning_tokens
            else (len(full_reasoning.split()) if full_reasoning else 0)
        )

        md = []
        status_suffix = " (Completed)" if is_final else " (Streaming... ⏳)"
        md.append(f"# 🤖 LLM Request Log: `{self.req_filename[:-3]}`{status_suffix}")
        md.append(f"- **Timestamp:** `{datetime.now().isoformat()}`")
        md.append(f"- **Model:** `{self.model}`")
        if self.provider:
            md.append(f"- **Provider:** `{self.provider}`")
        md.append("")
        md.append("---")
        md.append("")
        md.append("## 📥 Input")
        md.append("```json")
        md.append(json.dumps(self.messages, ensure_ascii=False, indent=2))
        md.append("```")
        md.append("")
        md.append("---")
        md.append("")
        md.append("## 📤 Output")
        md.append("```markdown")
        md.append(full_output if full_output else "*(No completion output emitted)*")
        md.append("```")
        md.append("")
        md.append("---")
        md.append("")
        md.append("## 🧠 Reasoning Tokens")
        md.append(f"- **Reasoning Tokens Count:** `{resolved_reasoning_tokens}`")
        if full_reasoning:
            md.append("- **Reasoning Content:**")
            md.append("```markdown")
            md.append(full_reasoning)
            md.append("```")
        else:
            md.append("*(No separate reasoning content emitted)*")
        md.append("")
        md.append("---")
        md.append("")
        md.append("## 📊 Stats")
        md.append(f"- **Execution Time:** `{duration_sec:.3f}s`")
        md.append(f"- **Prompt Tokens:** `{resolved_prompt_tokens:,}`")
        md.append(f"- **Completion Tokens:** `{resolved_completion_tokens:,}`")
        md.append(f"- **Reasoning Tokens:** `{resolved_reasoning_tokens:,}`")
        md.append(f"- **Total Tokens:** `{resolved_total_tokens if resolved_total_tokens else (resolved_prompt_tokens + resolved_completion_tokens + resolved_reasoning_tokens):,}`")
        md.append("")

        with open(self.log_file, "w", encoding="utf-8") as f:
            f.write("\n".join(md))

    def finalize(self):
        self.flush(is_final=True)


def log_llm_call(
    messages: List[Dict[str, Any]],
    response: Any,
    model: str = "",
    provider: str = "",
    duration_sec: float = 0.0,
    request_id: Optional[str] = None,
) -> Path:
    """
    Synchronous/One-shot fallback helper for non-streamed LLM responses.
    """
    start_t = time.time() - duration_sec
    logger = StreamingLLMLogger(
        messages=messages,
        model=model,
        provider=provider,
        request_id=request_id,
        start_time=start_t
    )

    output_text = ""
    reasoning_content = ""
    if hasattr(response, "choices") and response.choices:
        choice = response.choices[0]
        msg = getattr(choice, "message", None)
        if msg:
            if isinstance(msg, dict):
                output_text = msg.get("content") or ""
                reasoning_content = msg.get("reasoning_content") or ""
            else:
                output_text = getattr(msg, "content", None) or ""
                reasoning_content = getattr(msg, "reasoning_content", None) or ""
                if not reasoning_content and hasattr(msg, "model_extra") and isinstance(msg.model_extra, dict):
                    reasoning_content = msg.model_extra.get("reasoning_content") or ""

    usage = getattr(response, "usage", None)
    logger.append_chunk(content=output_text, reasoning=reasoning_content, usage=usage)
    logger.finalize()
    return logger.log_file
