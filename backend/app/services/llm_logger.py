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
        self.req_id = request_id or req_uuid
        self.req_filename = f"req_{timestamp_str}_{self.req_id}.md"
        self.log_file = self.day_dir / self.req_filename

        self.output_text_chunks: List[str] = []
        self.reasoning_chunks: List[str] = []
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0
        self.reasoning_tokens = 0
        self.last_flush_time = self.start_time

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
            self.prompt_tokens = getattr(usage, "prompt_tokens", self.prompt_tokens) or 0
            self.completion_tokens = getattr(usage, "completion_tokens", self.completion_tokens) or 0
            self.total_tokens = getattr(usage, "total_tokens", self.total_tokens) or 0
            details = getattr(usage, "completion_tokens_details", None)
            if details:
                self.reasoning_tokens = getattr(details, "reasoning_tokens", self.reasoning_tokens) or 0

        now = time.time()
        if now - self.last_flush_time >= self.flush_interval_sec:
            self.flush(is_final=False)

    def flush(self, is_final: bool = False):
        now = time.time()
        self.last_flush_time = now
        duration_sec = max(0.001, now - self.start_time)
        full_output = "".join(self.output_text_chunks)
        full_reasoning = "".join(self.reasoning_chunks)

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
        md.append(f"- **Reasoning Tokens Count:** `{self.reasoning_tokens}`")
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
        md.append(f"- **Prompt Tokens:** `{self.prompt_tokens:,}`")
        md.append(f"- **Completion Tokens:** `{self.completion_tokens:,}`")
        md.append(f"- **Reasoning Tokens:** `{self.reasoning_tokens:,}`")
        md.append(f"- **Total Tokens:** `{self.total_tokens:,}`")
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
