**Review Findings**

1. **Critical — The central contiguity invariant is not generally valid** (`§3`)
   - Real textbooks and exams frequently reuse a passage after intervening standalone questions, place questions in sidebars, refer back to an earlier figure, or say “Questions 21–24 refer to Passage A” before/after unrelated material.
   - Multi-column layouts can also make visually contiguous content non-contiguous in extracted reading order.
   - Treat this as an optimization with a confidence score, not a correctness invariant. Allow explicit non-contiguous edges and cross-chunk references as a fallback.

2. **Critical — The chunker contradicts its “never split a group” guarantee** (`§5.3`)
   - When `current_tokens >= max_tokens`, the code finalizes even if `OPEN_GROUP` or `OPEN_THEORY` is active.
   - A single passage/group can itself exceed `max_tokens`, so both constraints cannot always be satisfied.
   - Define an oversize-unit policy: permit an oversize chunk, split with shared context overlap, or store the context once and pass a stable `context_id` to workers.

3. **Critical — The architecture still creates a multi-million-token linking bottleneck** (`§2`, `§5.4`, `§6`)
   - The linking agent receives approximately 7.1M input tokens and emits 7M output tokens. This recreates the long-context cost, latency, and degradation problem the architecture claims to eliminate.
   - Resolve most links deterministically within document/chapter/group partitions. Send only ambiguous candidate sets to the LLM.
   - The LLM should return compact edge decisions or patches, not reproduce the complete graph and full context text.

4. **Critical — The page metadata is insufficient to reconstruct atomic groups** (`§4.2`, `§5.2`)
   - `head` and `tail` record whether something is open, but not *which* group continues, the confidence, column/region, source coordinates, or whether a page contains several independent streams.
   - `Q_START` alone cannot establish that a question belongs to the active stimulus. `Q_END` is emitted but ignored by reconstruction.
   - Add stable block IDs, continuation IDs, bounding boxes/polygons, reading-order edges, column/region IDs, source spans, extraction confidence, and explicit `GROUP_START`/`GROUP_END` events.

5. **High — Reconstruction mishandles several state transitions** (`§5.2`)
   - Starting a new stimulus closes the old group even if the previous group is unresolved.
   - A question without `STIM_START` is omitted from `global_groups`.
   - `WORKED_EX`, `Q_END`, `OPEN_STEM`, solution events, and standalone questions are ignored.
   - `active_theory` is not closed when a question or stimulus begins unless the page tail happens to be `CLEAN`.
   - Page numbers can be appended multiple times, and inconsistent `head`/previous `tail` states are silently accepted.
   - Replace independent `active_group` and `active_theory` variables with a validated stack/state machine that emits diagnostics for illegal transitions.

6. **High — Context can leak into unrelated questions** (`§5.4`)
   - `active_context_id` remains active until a parser-provided `is_last_question_of_group` flag appears. If that flag is missing, every subsequent question inherits the old context.
   - The resolver also overwrites any existing `context_id`, including potentially higher-confidence parser output.
   - Use explicit group ranges or candidate edges with confidence. Never infer indefinite continuation from the absence of a closing signal.

7. **High — Question numbering is not a unique key** (`§5.4`)
   - `solution_map = {question_num: solution}` overwrites repeated numbers across chapters, tests, editions, sections, and nested subquestions.
   - Sorting by `question_index` can also reorder or collide when workers generate local indices.
   - Use a composite identity such as `(document_id, edition, section_path, test_id, page, local_number, subpart)` plus an immutable global source-order key.

8. **High — Document-level modality routing is too coarse** (`§5.1`)
   - Hybrid PDFs often contain native pages, scanned pages, image-only diagrams, broken fonts, or invisible but unusable OCR layers. Five fixed samples can miss entire scanned sections.
   - Character count does not measure extraction quality; garbled text can exceed 200 characters.
   - Classify per page using text density, glyph validity, image coverage, rendering/OCR agreement, and language plausibility. Route uncertain pages through both paths and select or merge results.

9. **High — Native PDF extraction is not structurally equivalent to OCR** (`§2`)
   - `get_text("text")` often loses columns, tables, superscripts, equations, captions, and reading order. Native PDFs still need layout analysis and sometimes OCR for embedded figures.
   - Both routes should produce the same canonical block model with geometry and provenance. Avoid having one route emit plain text while the other emits vision-derived structure.

10. **High — OCR text flow is unclear**
    - The diagram shows vision OCR feeding the compact metadata stream, but the parser later needs full page text, equations, options, images, and coordinates.
    - Define an immutable page artifact containing rendered image hash, raw OCR, normalized text, layout blocks, metadata events, and model/version provenance. Metadata should index this artifact rather than replace it.

11. **High — Progressive SSE reconstruction needs an ordered watermark** (`§7`)
    - An `$O(N)$` sort is not progressive merely because page results arrive over SSE.
    - With out-of-order completion, page `p` cannot be finalized until all earlier pages that could affect its state are known.
    - Maintain a reorder buffer and a `highest_contiguous_page` watermark. Stream provisional page results separately from finalized groups, and emit corrections/versioned events when necessary.

12. **High — Single-page failures can invalidate boundaries**
    - If a failed page contains `STIM_START`, `GROUP_END`, or a new section boundary, adjacent pages cannot be safely partitioned.
    - Represent missing pages explicitly and block finalization around an uncertainty window. Retry with another OCR engine/model, then quarantine unresolved spans into conservative chunks.

13. **Medium — The 25–35-token metadata target is unrealistic**
    - The example itself is substantially larger than 25–35 model tokens, before geometry, confidence, and identifiers are added.
    - Optimize serialized storage separately from model output. A few hundred structured tokens per page is still tiny relative to full OCR and may materially improve correctness.

14. **Medium — BERT/LayoutLM is not a drop-in replacement for extraction**
    - A BIO tagger classifies existing tokens; it does not perform OCR, reliably reconstruct tables, normalize reading order, or generate LaTeX.
    - LayoutLM-family models also have finite windows and require token-coordinate alignment.
    - Split responsibilities into OCR/layout recovery, span classification, deterministic normalization, and selective math recognition. Compare complete pipeline cost and quality, not only tagger GPU time.

15. **Medium — “Zero hallucinations” and “100% structural integrity” are not defensible**
    - OCR and probabilistic models cannot provide these guarantees without constrained transcription and source verification.
    - Replace them with measurable targets: character error rate, block recall, question recall, link precision/recall, unsupported-text rate, and percentage requiring review.
    - Every extracted field should retain source page, bounding region, source text span, model/version, and confidence.

16. **Medium — Answer-key resolution needs richer matching**
    - Answer grids can use ranges, reordered sections, test variants, duplicate numbering, omitted questions, and corrections.
    - Use constrained matching over section identity, sequence ranges, option domain, nearby headings, and expected cardinality. Preserve conflicts rather than silently selecting one answer.

17. **Medium — Cost estimates omit major components** (`§6`)
    - Missing costs include PDF rendering, OCR/VLM image pricing, retries, storage, queueing, embeddings/candidate retrieval, schema repair, validation, and human review.
    - The BERT estimate excludes training, labeling, inference orchestration, OCR, normalization, and model-loading overhead.
    - Output volume of 7M tokens for the linker is particularly expensive and suggests full graph retransmission rather than compact decisions.
    - Treat model names and prices as externally versioned configuration because availability, context limits, and pricing can change.

18. **Medium — Operational and security contracts are missing**
    - Document text is untrusted and can contain prompt-injection instructions. Models must treat content strictly as data.
    - Add idempotent task IDs, artifact hashes, schema versions, retries, dead-letter queues, model/prompt versioning, checksums, cancellation, and replay support.
    - SQLite may be suitable for a single writer, but concurrent workers and SSE consumers need WAL mode, a dedicated writer queue, transaction boundaries, and backpressure—or a production database/object-store split.

**Recommended Architecture Changes**

1. **Canonical source representation**
   - Render and classify every page independently.
   - Produce immutable `PageArtifact` records containing source hash, text, blocks, geometry, images, reading order, confidence, and provenance.
   - Keep raw transcription separate from normalized/derived text so normalization can never destroy evidence.

2. **Layout graph before semantic grouping**
   - Build blocks and reading-order edges using page geometry.
   - Represent columns, sidebars, tables, captions, headers, footers, and cross-page continuations explicitly.
   - Use one canonical representation for both native and scanned pages.

3. **Candidate grouping rather than permanent greedy locking**
   - Generate candidate `context -> question` edges using proximity, explicit ranges, typography, section boundaries, lexical references, and layout.
   - Assign confidence and preserve alternatives.
   - Auto-accept high-confidence edges, use deterministic constraints for medium-confidence edges, and send only ambiguity sets to the LLM.

4. **Component-aware partitioning**
   - Partition connected components only after high-confidence edges are established.
   - Permit external references through immutable IDs rather than prohibiting all cross-chunk lookup.
   - Define explicit handling for oversize components and unresolved/missing pages.

5. **Hierarchical reconciliation**
   - Reconcile locally by page range or section, then reconcile summaries at chapter/document level.
   - Match answers using composite question identities.
   - Return compact graph patches such as `add_edge`, `remove_edge`, `merge_block`, or `set_answer`, each with evidence and confidence.

6. **Validation and repair**
   - Run deterministic checks for missing/duplicate numbers, malformed options, impossible answer values, unclosed groups, source-less text, and answer-count mismatches.
   - Retry or escalate only failed spans rather than rerunning the whole document.
   - Never silently repair uncertain content; retain conflict records.

**Suggested Contract Additions**

A group event should look closer to:

```json
{
  "event": "GROUP_CONTINUE",
  "group_id": "doc123:test2:stimulus7",
  "page": 42,
  "region_id": "p42:c1:r8",
  "bbox": [72, 104, 510, 680],
  "source_order": 420018,
  "confidence": 0.94,
  "evidence": ["explicit_range:15-18", "same_column", "no_section_break"]
}
```

A question identity should be independent of the printed number:

```json
{
  "question_id": "doc123:test2:p42:q00016",
  "printed_number": "16",
  "section_path": ["Chapter 3", "Practice Test 2"],
  "source_order": 420021,
  "source_regions": ["p42:c1:r12", "p43:c1:r1"]
}
```

**Acceptance Criteria**

Before calling the system production-ready, evaluate it on a manually annotated corpus containing:

- Multi-column and interleaved layouts.
- Passages reused non-contiguously.
- Questions spanning pages and groups larger than the chunk limit.
- Hybrid PDFs, corrupted text layers, rotated pages, and missing OCR pages.
- Tables, diagrams, equations, footnotes, and answer grids.
- Duplicate numbering across chapters/tests and nested subquestions.
- Adversarial document text containing prompt-injection instructions.

Track at least block recall, reading-order accuracy, question exact-match recall, option recall, context-link precision/recall, answer-link accuracy, unsupported-text rate, unresolved rate, cost per page, and p50/p95 latency.

The strongest overall change is to replace “linear permanent group locking” with a provenance-backed layout graph plus confidence-scored candidate resolution. You can still keep the fast linear path for ordinary documents, but it should be an optimization—not the only representation of document structure.
