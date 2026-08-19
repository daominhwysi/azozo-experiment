---
name: subagent-parser
description: Orchestrates parallel Antigravity subagents to parse raw OCR exam documents into sequence-labelled XML outputs using the annotator prompt from backend/app/domains/ocr/annotator and sliding-window concurrency. Activate when the user asks to run subagents as parsers, batch annotate documents using subagents, or orchestrate distributed parsing.
---

# Subagent Parser Orchestrator (XML Sequence Labelling)

This skill guides the Antigravity Main Agent to act as an autonomous Master Orchestrator that provisions, dispatches, and manages parallel **Subagent Parser Workers** for high-throughput, token-efficient exam document parsing into **inline XML ground-truth format**.

---

## 🎯 Architecture Principles

1. **System Prompt Caching via `define_subagent`**:
   The orchestrator registers a custom subagent type `doc_parser` once with the complete XML annotation rules, Tag Dictionary, and few-shot examples from [`backend/app/domains/ocr/annotator/prompt_annotator.md`](file:///home/daominhwysi/project/azozo-experiment/backend/app/domains/ocr/annotator/prompt_annotator.md). Fresh worker subagents reuse this definition, benefiting from 100% prefix prompt caching without re-reading prompt files on every call.
2. **Pure XML Output Stream**:
   Each subagent processes a raw OCR markdown file and directly generates the verbatim text wrapped with ground-truth XML sequence tags (`<question_label>`, `<stem>`, `<option_label>`, `<option_text>`, `<section>`, `<stimulus>`, `<explanation>`), saved to `.xml`.
3. **Fresh Subagent per Document**:
   Each document is assigned to an isolated, fresh subagent. This eliminates context-window accumulation and guarantees zero cross-document hallucinations.
4. **Sliding-Window Concurrency**:
   Maintains a bounded pool of up to `CONCURRENCY` active subagents, filling finished slots reactively as notifications arrive.

---

## ⚙️ Parameters & Defaults

When activating this workflow, resolve or ask for the following parameters:

| Parameter | Default Value | Description |
| :--- | :--- | :--- |
| `CONCURRENCY` | `4` | Number of parallel subagents active at once. |
| `SYSTEM_PROMPT_FILE` | `"backend/app/domains/ocr/annotator/prompt_annotator.md"` | Path to the annotator system prompt containing the XML Tag Dictionary & strict annotation rules. |
| `INPUT_DIR` | `"data/sequence_labelling_input_data"` | Input directory containing raw OCR `.md` files. |
| `OUTPUT_DIR` | `"data/sequence_labelling_annotated"` | Output directory where annotated `.xml` files will be written. |
| `OVERWRITE` | `false` | If `false`, skips documents that already have generated `.xml` outputs. |

---

## 🏷️ Target XML Tags
Subagents annotate using the following tag schema:
- `<section>...</section>`: Major section/part titles, subject headers, general directions.
- `<stimulus id="..." start_anchor="..." end_anchor="..." />`: Compact anchor for shared reading passages / multi-question tables (applied only if related to 2+ questions).
- `<question_label>...</question_label>`: Question prefix indicators (e.g. `**101.**`, `Câu 1:`).
- `<stem>...</stem>`: Question text body.
- `<option_label>...</option_label>`: Choice markers (e.g. `(A)`, `A.`, `a)`, `b)`).
- `<option_text>...</option_text>`: Choice / sub-question body text.
- `<explanation>...</explanation>`: Solution / reference explanations.
- `<figure id="..." description="..." bbox="..." />`: Immutable OCR figure placeholders (preserved character-for-character).

---

## 🔄 Orchestration Workflow

### Step 1: Register the Custom Subagent Worker Type

1. Read the contents of `SYSTEM_PROMPT_FILE` (`backend/app/domains/ocr/annotator/prompt_annotator.md`) using `view_file`.
2. Register the `doc_parser` subagent type by calling `define_subagent`:

```json
{
  "name": "doc_parser",
  "description": "Specialized OCR exam XML sequence labelling worker",
  "enable_write_tools": true,
  "enable_subagent_tools": false,
  "enable_mcp_tools": false,
  "system_prompt": "<CONTENT_OF_PROMPT_ANNOTATOR_MD>\n\n---\n# ⛔ STRICT WORKER EXECUTION PROTOCOL (ZERO-EXPLORATION RULE):\nYou are a focused, single-document XML parser worker.\nYou MUST adhere to the following strict execution rules:\n1. **ZERO CODEBASE EXPLORATION**:\n   - DO NOT run `find_by_name`, `grep_search`, `list_dir`, `run_command`, or inspect any other files or directories in the codebase.\n   - DO NOT search for examples, other XML files, or external references. All tagging rules and examples you need are already provided in your system prompt.\n2. **STRICT 2-STEP TOOL EXECUTION**:\n   - **Step 1**: Use `view_file` ONLY on the exact `Input file` path provided in your user prompt to read the document.\n   - **Step 2**: Parse and annotate the entire text strictly adhering to the Tag Dictionary and Rules above (ensuring `<pages>`, `<page>`, and `<page_metadata>` are pruned and continuous tags concatenated), then call `write_to_file` ONLY on the exact `Output file` path specified in your user prompt.\n3. **CONCLUSION**:\n   - Immediately conclude by outputting a single-line JSON status:\n   {\"status\": \"SUCCESS\", \"input\": \"<in_path>\", \"output\": \"<output_path>\", \"questions_count\": <int>}\n   - Finish immediately. Do not execute any further commands."
}
```

### Step 2: Build Task Queue & Filter Completed Work

1. Scan `INPUT_DIR` for all `.md` documents recursively using `list_dir` or `run_command`.
2. For each document:
   - Determine its target output path: `OUTPUT_DIR / rel_path.parent / stem / "merged.xml"`.
   - If `OVERWRITE` is `false` and the output file already exists, exclude it from the queue.
3. Construct the queue of pending tasks: `[doc_1, doc_2, ..., doc_N]`.
4. Report total discovered files, already completed files, and files pending processing.

### Step 3: Dispatch Initial Concurrency Batch

1. Take the first `K = min(CONCURRENCY, len(queue))` items from the queue.
2. For each item, invoke a worker using `invoke_subagent`:
   - `TypeName`: `"doc_parser"`
   - `Role`: `"XML Parser [Doc {idx}/{total}]"`
   - `Prompt`: `"Input file: '{in_path}', Output file: '{output_path}'"`
3. After dispatching the batch, **stop calling tools** to yield execution and allow subagents to execute in the background.

### Step 4: Reactive Wake-Up & Queue Replenishment

1. When a subagent completes, the system automatically wakes up the orchestrator with the worker's completion message.
2. Parse the worker's status and record the outcome (Success / Failed).
3. If there are remaining documents in the pending queue:
   - Dequeue the next document.
   - Immediately call `invoke_subagent` to keep active concurrency at `CONCURRENCY`.
4. If the queue is empty and all dispatched subagents have completed, proceed to Step 5.

### Step 5: Output Metrics & Summary Table

Render a clean summary report in Markdown:

```markdown
### Sequence Parsing Batch Execution Summary
- **Total Processed**: {total}
- **Succeeded**: {success_count}
- **Failed**: {failed_count}
- **Output Directory**: `{OUTPUT_DIR}`

| Document | Status | Questions | Output XML File |
| :--- | :--- | :--- | :--- |
| `HSG_Other/Vat_ly/exam_174.md` | SUCCESS | 24 | `HSG_Other/Vat_ly/exam_174/merged.xml` |
| `Hoc_ky_Kiem_tra/Toan/exam_003.md` | SUCCESS | 50 | `Hoc_ky_Kiem_tra/Toan/exam_003/merged.xml` |
```
