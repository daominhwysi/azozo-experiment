from typing import List, Dict, Any

def greedy_oversize_chunker(
    page_list: List[Dict[str, Any]],
    target_tokens: int = 25000,
    max_tokens: int = 35000
) -> List[List[Dict[str, Any]]]:
    """
    Partitions pages into target-sized chunks (~25k tokens).
    NEVER cuts inside an active passage or question group unless forced by max_tokens.
    """
    chunks: List[List[Dict[str, Any]]] = []
    current_chunk: List[Dict[str, Any]] = []
    current_tokens = 0
    active_context_header = None

    for page in page_list:
        if active_context_header and not current_chunk:
            page["injected_context_header"] = active_context_header

        current_chunk.append(page)
        page_tokens = page.get("estimated_tokens") or max(50, len(page.get("text", "").split()))
        current_tokens += page_tokens

        if current_tokens >= target_tokens:
            is_in_group = page.get("tail") in ("OPEN_GROUP", "OPEN_THEORY", "OPEN_STIM", "OPEN_STEM", "OPEN_OPT")

            if not is_in_group:
                chunks.append(current_chunk)
                current_chunk = []
                current_tokens = 0
                active_context_header = None
            elif current_tokens >= max_tokens:
                # Oversized Group Policy: Finalize chunk and propagate active stimulus header
                active_context_header = page.get("active_stimulus_id") or page.get("stimulus_id")
                chunks.append(current_chunk)
                current_chunk = []
                current_tokens = 0

    if current_chunk:
        chunks.append(current_chunk)

    return chunks
