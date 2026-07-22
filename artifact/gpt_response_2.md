The architecture has a strong overall direction—especially separating extraction from graph linking and using deterministic patch application—but it is not yet production-safe. The largest risks are identity stability, state-machine correctness, chunk continuation handling, and optimistic cost estimates.

**Critical Findings**

- **Entity IDs are not actually immutable or globally unique.** `doc_id:section:p{page}:q{num}` breaks when a question starts on one page and continues on another, when numbering restarts within a section, when pages are inserted/re-OCRed, or when the same question appears in multiple editions. It also conflicts with the stated support for non-contiguous context reuse. Use a stable document fingerprint plus source span and occurrence index, for example:
  ```text
  doc_version_id:section_id:question_occurrence_id
  ```
  Store page ranges, bounding boxes, extraction offsets, and normalized question numbers as attributes rather than embedding page number into the primary key.

- **The state machine does not implement the hierarchy described in the document.** The code only pushes stimulus groups; it does not push or pop chapters, sections, theory blocks, or questions. `SECTION_START` merely changes `current_section`, so a section transition can leave an existing group attached to the new section. `CHAPTER`, `SECTION`, `THEORY`, and nested stimulus boundaries need explicit stack frames and transition rules.

- **`tail == "CLEAN"` closes the top-level group too aggressively.** A clean page boundary does not necessarily mean the current context-question group is complete. A group may end only after an explicit `STIM_END`, a verified next-group boundary, or a high-confidence structural transition. Otherwise multi-page passages and questions will be prematurely closed.

- **Metadata events are trusted without validation.** Missing `Q_END`, duplicate `Q_START`, an `STIM_END` with no open stimulus, page gaps, out-of-order pages, and malformed event payloads are silently accepted. Add a formal event grammar, validation errors, recovery states, and an audit trail. Do not silently flush all residual groups as `PARTIAL_CLOSED` without recording why and how much content was lost.

- **The chunker’s continuation-header logic is currently nonfunctional.** `active_context_header` is never assigned from a normal open group; it is only assigned from `page.get("active_stimulus_id")`, which is not produced by the shown state machine or metadata schema. Also, `injected_context_header` is added to the page metadata object rather than the actual parser prompt/content contract. Define an explicit `ContextContinuation` record and test that every continuation chunk receives the same context identity and opening context text.

- **Oversized groups can exceed the stated maximum.** The chunker only checks the threshold after adding a whole page. A single page can take a chunk beyond `max_tokens`, and a single group larger than `max_tokens` is not actually sub-chunked—it is merely split at page boundaries. Define whether `max_tokens` is hard or soft, support page/text-span splitting, and account for headers, prompts, JSON output, and model-specific tokenization.

- **Graph patches are not safely mergeable.** `ADD_EDGE` currently overwrites `context_id`; multiple valid context edges cannot be represented. There is no duplicate handling, conflict resolution, source provenance, schema validation, referential-integrity check for `context_id`, or idempotency key. Use an edge collection with stable `edge_id`, operation version, provenance, and confidence calibration:
  ```json
  {
    "op": "ADD_EDGE",
    "edge_id": "...",
    "q_id": "...",
    "context_id": "...",
    "confidence": 0.99,
    "source": "resolver-v1",
    "evidence": {"page_range": [14, 15]}
  }
  ```

- **The resolver can set answers without verifying answer semantics.** `SET_ANSWER` accepts arbitrary values, ignores `explanation_ref`, and does not distinguish extracted answers from inferred answers. Validate answer shape against question type, preserve candidate answers and provenance, and require explicit conflict handling when parser and resolver disagree. Never let an LLM patch directly overwrite a trusted answer without a deterministic policy.

**Important Design Changes**

- **Separate extraction identity from semantic identity.** Maintain:
  - `document_id`: logical document identity
  - `document_version_id`: exact source/version hash
  - `occurrence_id`: stable occurrence within that version
  - `question_number`: displayed number
  - `source_spans`: pages, coordinates, and text offsets
  This avoids making page numbers part of a supposedly immutable key.

- **Make page metadata evidence, not truth.** The detector should emit confidence, alternate hypotheses, source bounding boxes, and raw evidence. For example:
  ```json
  {
    "event": "Q_START",
    "value": "15",
    "confidence": 0.97,
    "evidence": {"page": 42, "bbox": [80, 310, 140, 335]}
  }
  ```
  Low-confidence structural decisions should be routed to a reconciliation pass rather than committed directly.

- **Use a two-pass reconstruction strategy.** First create immutable page/span nodes and candidate boundaries. Then resolve groups and hierarchy with deterministic rules plus targeted model calls. This makes reprocessing individual pages possible without regenerating the entire graph.

- **Define explicit boundary semantics.** Document the meaning of `head`, `tail`, `OPEN_GROUP`, `CLEAN`, and `OPEN_STEM`. In particular, distinguish:
  - group continues to next page
  - question continues to next page
  - answer choices continue to next page
  - shared context ends but questions continue
  - new section starts while the previous group remains unresolved

- **Do not rely on “95%+” without benchmark evidence.** Build a labeled corpus covering scans, columns, tables, headers/footers, answer keys, repeated numbering, nested passages, textbook cross-references, and OCR errors. Report boundary precision/recall, question recall, context-link precision/recall, answer accuracy, and partial-group rate.

- **Add a deterministic fallback for linking.** Most contiguous groups should be linked without an LLM. Use structural adjacency, explicit passage labels, source spans, and section hierarchy first; invoke the resolver only for ambiguous or non-contiguous cases. This reduces cost and makes behavior reproducible.

**Cost Model Risks**

- The arithmetic in the table is internally consistent: approximately `$3.656`, rounded to `$3.66`.
- The model names and prices need a timestamp, provider, region, cache assumptions, and API version. Treat them as configuration rather than architectural constants.
- OCR/Vision costs are missing from the total even though scanned PDFs are a primary target.
- Embeddings, storage, queueing, retries, failed calls, JSON repair, validation passes, observability, and human review are also excluded.
- Output volume is likely optimistic for 6.5M extracted JSON tokens from 10M input tokens, especially for OCR correction, bounding boxes, equations, confidence values, and provenance.
- The graph resolver input should include enough evidence to resolve ambiguity. If it receives only candidate IDs, it cannot reliably decide links; if it receives text snippets, those tokens must be included in the cost model.
- Provide P50/P95 cost estimates and a worst-case retry budget rather than a single nominal number.

**Missing Production Requirements**

- Idempotent job and patch processing
- Durable intermediate artifacts and resumable checkpoints
- Per-page and per-chunk retry/dead-letter handling
- Schema versioning for metadata, entities, and patches
- Strict JSON Schema validation
- Deterministic replay from stored inputs
- Tenant/document isolation and access controls
- PII and sensitive-content handling
- Rate limiting and provider failover
- Token-budget enforcement based on the actual tokenizer
- Metrics and alerts for OCR quality, parser failure, unresolved groups, patch conflicts, and cost overruns
- A human-review queue for low-confidence structural decisions

**Suggested Revised Execution Order**

1. Extract immutable page, span, bounding-box, and OCR artifacts.
2. Detect structural events with confidence and evidence.
3. Validate and reconcile events into a versioned document graph.
4. Assign stable occurrence-based entity IDs.
5. Partition using explicit continuation records and hard token budgets.
6. Parse chunks independently with provenance and confidence.
7. Apply deterministic context links first.
8. Send only unresolved candidates plus minimal evidence to the resolver.
9. Validate and merge patches transactionally and idempotently.
10. Run graph invariants and quality checks before publishing to the API/UI.

The main recommendation is to revise the document’s “Verified & Hardened” status. The architecture is promising, but the current pseudocode does not yet support that claim—particularly for multi-page groups, section transitions, stable identity, and safe graph merging.
