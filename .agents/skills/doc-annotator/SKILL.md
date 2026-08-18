---
name: doc-annotator
description: Directly annotates raw OCR exam documents into sequence-labelled XML format without subagents, external scripts, or heuristic code. Enforces manual, token-level LLM sequence labelling preserving 100% verbatim text and XML tags. Activate when annotating exam documents in single-agent environments, when subagents are unavailable, or when manual sequence labelling is requested.
---

# Direct Document Annotator (XML Sequence Labelling)

This skill guides the AI agent to perform **direct, token-level manual sequence labelling** on raw OCR exam documents into **inline XML ground-truth format**.

It is designed specifically for **single-agent environments** where the subagent orchestrator feature (`invoke_subagent`, `define_subagent`) is unavailable, disabled, or not supported, or when strict manual ground-truth annotation without heuristic automation is required.

---

## ⛔ Strict Operational Directives (Zero-External-Tools & Zero-Scripting)

When this skill is active, the agent **MUST** adhere to the following mandatory constraints:

1. **NO SUBAGENT DELEGATION**:
   - DO NOT call `invoke_subagent`, `define_subagent`, or `manage_subagents`. All parsing must be performed directly within your own context window.
2. **NO HEURISTIC / REGEX / PYTHON SCRIPTS**:
   - DO NOT attempt to write or execute Python scripts, Bash regex hacks, or heuristic parser scripts to perform the annotation.
   - *Rationale*: Natural educational exam layouts (TOEIC, SAT, Vietnamese National High School Exams) feature nested LaTeX math formulas, non-standard punctuation, multi-column tables, sub-questions (`a)`, `b)`), and reading stimuli that regular expressions and algorithmic parsers consistently corrupt.
3. **NO CODEBASE EXPLORATION DURING PARSING**:
   - DO NOT run `find_by_name`, `grep_search`, `list_dir`, or inspect unrelated files. The complete Tag Dictionary, strict rules, and examples are fully specified within this skill.
4. **DIRECT 2-STEP TOOL EXECUTION PER DOCUMENT**:
   - **Step 1**: Use `view_file` to read the input raw OCR Markdown file.
   - **Step 2**: Perform the sequence labelling directly in memory and use `write_to_file` to write the annotated XML to the target output path.

---

## 🏷️ XML Tag Dictionary

| XML Tag | Type | Description & Usage |
| :--- | :--- | :--- |
| `<section>...</section>` | Paired | Major section/part titles, headers, exam directions, subject block titles (e.g. `<section>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn...</section>`, `<section>## PART 5</section>`). Always use paired tags; do **not** use self-closing anchor tags for sections. |
| `<stimulus id="stim_N" start_anchor="..." end_anchor="..." />` | Self-closing | Shared reading passages, tables, datasets, multi-passage sets, or context prompts. **Crucial Rule**: Apply **ONLY** if the context is shared across **2 OR MORE QUESTIONS**. For single-question contexts, place the text directly inside `<stem>`. `start_anchor` = first 3–10 verbatim words; `end_anchor` = last 3–10 verbatim words. |
| `<question_label>...</question_label>` | Paired | Question prefix indicators (e.g. `**101.**`, `**Câu 1.**`, `Question 5:`, `Câu 12:`). |
| `<stem>...</stem>` | Paired | Question body text and question-specific context following the question label. |
| `<option_label>...</option_label>` | Paired | Choice letters/prefixes and sub-question indicators (e.g. `(A)`, `(B)`, `A.`, `B.`, `a)`, `b)`, `c)`, `d)`). |
| `<option_text>...</option_text>` | Paired | The textual content of choices or sub-question items following an `<option_label>`. |
| `<explanation>...</explanation>` | Paired | Solution texts, reference explanations, and answer keys. |
| `<figure id="fig_N" description="..." bbox="..." />` | Self-closing | Vision OCR figure placeholder. **Immutable**: Must be preserved character-for-character with all attributes intact. |

---

## 📜 Strict Annotation Rules

1. **100% Verbatim Preservation (Zero Text Alteration)**:
   - Do NOT edit, correct typos, rephrase, spell-check, or omit any characters, Markdown formatting, LaTeX expressions (`$...$`, `$$...$$`), or page markers (`<|page|>Page X`).
   - Every whitespace and newline structure inside question elements should match the original layout.
2. **Compact Stimulus Anchor Rule (2+ Questions Only)**:
   - A `<stimulus>` tag MUST ONLY be created if the passage/context/data block relates to **2 or more questions** (e.g., reading passage for questions 6–10, dataset for questions 515–517).
   - If a piece of text, table, or context relates to **only 1 single question**, include it directly inside that question's `<stem>...</stem>`.
   - Never tag generic section headers, subject titles, or exam metadata as `<stimulus>`.
3. **Full Annotation Coverage**:
   - ALL components in the input document MUST be annotated. Do NOT leave questions, choices, or section titles untagged.
4. **Sub-Question & Choice Labelling in Essay / True-False Items**:
   - In essay, structured, or True/False questions where sub-items like `a)`, `b)`, `c)`, `d)` appear, tag `a)`, `b)` in `<option_label>...</option_label>` and their corresponding body text in `<option_text>...</option_text>`.
   - Never absorb sub-item labels `a)`, `b)` into `<stem>`.
5. **Tabular & Unlabeled Sub-Questions**:
   - When sub-questions or True/False statements appear inside Markdown/HTML tables without choice letters, tag each evaluated statement cell text as `<option_text>...</option_text>` (e.g., `<td><option_text>Statement text...</option_text></td>`). Table structure tags (`<table>`, `<tr>`, `<td>`) remain un-tagged structure.
6. **Figure Immutability**:
   - Preserve `<figure id="..." description="..." bbox="..." />` exactly as provided. It may sit inside a `<stem>`, `<option_text>`, or between items.
7. **End Delimiter**:
   - Append `<|END|>` at the very end of the output XML document.

---

## 🔄 Execution Workflow

### Scenario A: Annotating a Single Document

```
[User Request / Single File Path]
       │
       ▼
1. view_file(input_file_path)
       │
       ▼
2. Direct Token-by-Token Sequence Labelling (In-Memory Reasoning)
   - Apply Tag Dictionary & Strict Rules
   - Preserve 100% verbatim text
       │
       ▼
3. write_to_file(output_file_path, CodeContent=annotated_xml)
       │
       ▼
4. Output Completion Confirmation & Stats (Questions Count, Sections Count)
```

### Scenario B: Batch Processing Multiple Documents Sequentially

When given a directory of documents (`INPUT_DIR`):

1. **Discover Files**: Use `list_dir` or `find_by_name` on `INPUT_DIR` to list target `.md` files.
2. **Determine Targets**:
   - For each `relative/path/to/exam.md`, map output to `OUTPUT_DIR/relative/path/to/exam/merged.xml` (or matching directory structure).
   - If `OVERWRITE=false` and output file exists, skip to next.
3. **Sequential Loop**:
   - For each file in queue:
     1. Read file with `view_file`.
     2. Annotate in memory.
     3. Write output with `write_to_file`.
     4. Log progress: `[Doc i/N] Processed: <path> -> <output_path> (<count> questions)`.
4. **Summary Report**: Render a final markdown table of all processed documents.

---

## 💡 Reference Examples

### Example 1: Vietnamese High School Exam (Math / Multi-Part / True-False / Essay)

#### Input:
```markdown
**SỞ GIÁO DỤC VÀ ĐÀO TẠO HẢI PHÒNG**
**ĐỀ KHẢO SÁT KỲ THI TỐT NGHIỆP THPT**
**Môn: TOÁN**

**Phần I. Câu trắc nghiệm nhiều phương án lựa chọn (3,0 điểm).**

**Câu 1.** Trong không gian với hệ trục tọa độ $Oxyz$, cho hai điểm $A(1;2;-1), B(3;0;1)$. Điểm $M$ thỏa mãn $\overrightarrow{MA}+3\overrightarrow{MB}=\vec{0}$ là

- **A.** $(2;-1;1)$.
- **B.** $(2;-1;0)$.
- **C.** $(-2;-1;0)$.
- **D.** $(2;1;0)$.

**Phần II. Câu trắc nghiệm đúng sai (4,0 điểm).**

**Câu 1.** Trong không gian với hệ tọa độ $Oxyz$, cho mặt cầu $(S): (x-2)^2+(y-1)^2+(z+1)^2=9$.

- **a)** Mặt cầu $(S)$ có tâm $I(2;1;-1)$.
- **b)** Khoảng cách từ tâm $I$ đến mặt phẳng $(P): x+2y-2z-3=0$ bằng 5.

**Phần IV. Câu hỏi tự luận (1,5 điểm).**

**Câu 1.** Cho hàm số $y = f(x) = x^3 - 3x + 2$.
- **a)** Tìm tập xác định của hàm số $y = f(x)$.
- **b)** Tính đạo hàm của hàm số tại $x = 1$.

---------- **HẾT** ----------
```

#### Annotated XML Output:
```xml
**SỞ GIÁO DỤC VÀ ĐÀO TẠO HẢI PHÒNG**
**ĐỀ KHẢO SÁT KỲ THI TỐT NGHIỆP THPT**
**Môn: TOÁN**

<section>**Phần I. Câu trắc nghiệm nhiều phương án lựa chọn (3,0 điểm).**</section>

<question_label>**Câu 1.**</question_label> <stem>Trong không gian với hệ trục tọa độ $Oxyz$, cho hai điểm $A(1;2;-1), B(3;0;1)$. Điểm $M$ thỏa mãn $\overrightarrow{MA}+3\overrightarrow{MB}=\vec{0}$ là</stem>

- <option_label>**A.**</option_label> <option_text>$(2;-1;1)$.</option_text>
- <option_label>**B.**</option_label> <option_text>$(2;-1;0)$.</option_text>
- <option_label>**C.**</option_label> <option_text>$(-2;-1;0)$.</option_text>
- <option_label>**D.**</option_label> <option_text>$(2;1;0)$.</option_text>

<section>**Phần II. Câu trắc nghiệm đúng sai (4,0 điểm).**</section>

<question_label>**Câu 1.**</question_label> <stem>Trong không gian với hệ tọa độ $Oxyz$, cho mặt cầu $(S): (x-2)^2+(y-1)^2+(z+1)^2=9$.</stem>

- <option_label>**a)**</option_label> <option_text>Mặt cầu $(S)$ có tâm $I(2;1;-1)$.</option_text>
- <option_label>**b)**</option_label> <option_text>Khoảng cách từ tâm $I$ đến mặt phẳng $(P): x+2y-2z-3=0$ bằng 5.</option_text>

<section>**Phần IV. Câu hỏi tự luận (1,5 điểm).**</section>

<question_label>**Câu 1.**</question_label> <stem>Cho hàm số $y = f(x) = x^3 - 3x + 2$.</stem>
- <option_label>**a)**</option_label> <option_text>Tìm tập xác định của hàm số $y = f(x)$.</option_text>
- <option_label>**b)**</option_label> <option_text>Tính đạo hàm của hàm số tại $x = 1$.</option_text>

---------- **HẾT** ----------<|END|>
```

---

### Example 2: Reading Comprehension with Shared Stimulus (2+ Questions)

#### Input:
```markdown
*Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions from 6 to 7.*

Urban green spaces, such as parks, community gardens, and tree-lined avenues, provide vital ecological and social benefits in modern cities. They help reduce heat island effects and promote mental well-being among residents.

Question 6. Which of the following best serves as the title for the passage?
A. The Expansion of Urban Architecture
B. Benefits of Urban Green Spaces
C. City Pollution and Solutions
D. Community Gardening Techniques

Question 7. The word "vital" in paragraph 1 is closest in meaning to _______.
A. essential
B. optional
C. decorative
D. temporary
```

#### Annotated XML Output:
```xml
<stimulus id="stim_1" start_anchor="*Read the following passage" end_anchor="among residents." />

<question_label>Question 6.</question_label> <stem>Which of the following best serves as the title for the passage?</stem>
<option_label>A.</option_label> <option_text>The Expansion of Urban Architecture</option_text>
<option_label>B.</option_label> <option_text>Benefits of Urban Green Spaces</option_text>
<option_label>C.</option_label> <option_text>City Pollution and Solutions</option_text>
<option_label>D.</option_label> <option_text>Community Gardening Techniques</option_text>

<question_label>Question 7.</question_label> <stem>The word "vital" in paragraph 1 is closest in meaning to _______.</stem>
<option_label>A.</option_label> <option_text>essential</option_text>
<option_label>B.</option_label> <option_text>optional</option_text>
<option_label>C.</option_label> <option_text>decorative</option_text>
<option_label>D.</option_label> <option_text>temporary</option_text><|END|>
```

---

## 🚫 Critical Traps to Avoid

| Anti-Pattern | Why it Fails | Correct Direct Action |
| :--- | :--- | :--- |
| **Writing Python regex parser** | Regex breaks on nested LaTeX math formulas, multi-line questions, and edge cases. | Perform the sequence labelling manually in your LLM reasoning pass and write `.xml` directly. |
| **Spawning subagents** | Fails in environments without subagent tools (`invoke_subagent`). | Process the document directly in the current session. |
| **Tagging 1-question context as `<stimulus>`** | Violates the multi-question stimulus definition. | Keep single-question reading passages/contexts directly inside `<stem>...</stem>`. |
| **Absorbing `a)`, `b)` into `<stem>`** | Breaks downstream answer extraction for essay & true/false questions. | Wrap sub-items in `<option_label>` and their text in `<option_text>`. |
| **Modifying or cleaning text** | Corrupts token-level ground truth alignment against original OCR bounding boxes. | Preserve 100% verbatim text including typos, punctuation, and math formulas. |
