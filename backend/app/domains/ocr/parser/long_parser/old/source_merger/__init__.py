"""
Source-Grounded Parsed Chunk Merging Package.
"""

from backend.app.domains.ocr.parser.long_parser.source_merger.types import (
    ChunkInput,
    GlobalSpan,
    MergeDiagnostics,
    MergeResult,
    MergeInvariantError,
)
from backend.app.domains.ocr.parser.long_parser.source_merger.merger import merge_chunks

__all__ = [
    "ChunkInput",
    "GlobalSpan",
    "MergeDiagnostics",
    "MergeResult",
    "MergeInvariantError",
    "merge_chunks",
]
