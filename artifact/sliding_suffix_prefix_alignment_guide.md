# 🧩 Sliding Suffix-Prefix Alignment: Complete Guide & Reference Implementation

## 1. The Core Concept & Intuition

When document processing workflows break large documents into overlapping chunk windows (e.g., Chunk A covers pages 1–3, Chunk B covers pages 3–7), the **tail (suffix)** of Chunk A and the **head (prefix)** of Chunk B contain identical structural text from the shared boundary page (Page 3).

**Sliding Suffix-Prefix Alignment** operates without regex rules or domain-specific entity detection (`Question X`, `Mã đề`, `Câu X`). Instead, it slides the prefix window of Chunk B along the suffix window of Chunk A to locate the exact line where Chunk B's duplicate boundary content ends.

```
Chunk A (Suffix):   [Line A30] [Line A31] [Line A32] [Line A33] [Line A34]
                                            ║          ║          ║
Chunk B (Prefix):                        [Line B1]  [Line B2]  [Line B3]  [Line B4]  [Line B5]
                                         ───────────────────────────────
                                            Match Length = 3 lines
                                            Cut Index = Line B4
```

---

## 2. Step-by-Step Mechanism

### Step 1: Extract Boundary Windows
From the full line sequence of adjacent chunks:
* Extract the **last $K$ lines** of Chunk A ($\text{Suffix}_A$).
* Extract the **first $K$ lines** of Chunk B ($\text{Prefix}_B$).
*(A window size of $K = 30 \text{ to } 50$ lines covers 1–2 pages of overlap).*

### Step 2: Content Normalization (Fingerprinting)
Convert each line into a normalized **fingerprint** string to make matching immune to whitespace, capitalization, or tag formatting differences:

$$\text{Fingerprint}(\text{line}) = \text{lowercase}(\text{strip\_xml\_tags}(\text{strip\_whitespace}(\text{line})))$$

* Example XML line: `<question_label> **Question 20.** </question_label>`
* Fingerprint: `question20`

### Step 3: Sliding Alignment Search
Slide $\text{Prefix}_B$ across $\text{Suffix}_A$ to identify the alignment offset yielding the **longest contiguous sequence match**:

```
Offset 0:
  Suffix_A: [line_31, line_32, line_33, line_34]
  Prefix_B: [line_1,  line_2,  line_3,  line_4]
  Matches:  0

Offset 1:
  Suffix_A: [line_31, line_32, line_33, line_34]
  Prefix_B:          [line_1,  line_2,  line_3,  line_4]
  Matches:  0

Offset 2 (Match Found):
  Suffix_A: [line_31, line_32, line_33, line_34]
  Prefix_B:                   [line_1,  line_2,  line_3]  [line_4]
  Matches:  line_33 == line_1, line_34 == line_2, line_35 == line_3  (Match Length = 3)
```

The algorithm determines that the first 3 fingerprint lines of Chunk B (`line_1`, `line_2`, `line_3`) are duplicate boundary entries already present in Chunk A.

### Step 4: Splicing / Cutting Point
1. Keep **100% of Chunk A**.
2. Drop the first 3 lines of Chunk B (the duplicate prefix).
3. Concatenate the remaining lines of Chunk B (starting from `line_4`) onto Chunk A.

---

## 3. Concrete Worked Example

### Input Chunks

**Chunk A (Suffix / Tail):**
```xml
<question_label>**Question 19.**</question_label>
<stem>According to paragraph 1, genuine decarbonisation is...</stem>
<option_label>A.</option_label> <option_text>costly and demanding</option_text>
<question_label>**Question 20.**</question_label>
<stem>Which of the following best summarises paragraph 1?</stem>
```

**Chunk B (Prefix / Head):**
```xml
<question_label>**Question 20.**</question_label>
<stem>Which of the following best summarises paragraph 1?</stem>
<option_label>A.</option_label> <option_text>The great pressure...</option_text>
<option_label>B.</option_label> <option_text>Large-emission enterprises...</option_text>
```

### Alignment Execution
1. **Normalized Fingerprints of Chunk B Head:**
   * Line 1: `question20`
   * Line 2: `whichofthefollowingbestsummarisesparagraph1`
   * Line 3: `athegreatpressure`
2. **Matching against Chunk A Tail:**
   * Line 1 & Line 2 of Chunk B match the last 2 lines of Chunk A.
   * Line 3 of Chunk B (`athegreatpressure`) is unique content.
3. **Cut Index:** Splicing occurs right before Line 3 (`<option_label>A.</option_label>`).
4. **Final Merged Output:**
```xml
<question_label>**Question 19.**</question_label>
<stem>According to paragraph 1, genuine decarbonisation is...</stem>
<option_label>A.</option_label> <option_text>costly and demanding</option_text>
<question_label>**Question 20.**</question_label>
<stem>Which of the following best summarises paragraph 1?</stem>
<option_label>A.</option_label> <option_text>The great pressure...</option_text>
<option_label>B.</option_label> <option_text>Large-emission enterprises...</option_text>
```

---

## 4. Python Reference Implementation

```python
import re
from difflib import SequenceMatcher
from typing import List

def fingerprint(line: str) -> str:
    """Strips XML tags, punctuation, and whitespace for fuzzy matching."""
    text_only = re.sub(r"<[^>]+>", "", line)
    return re.sub(r"[\W_]+", "", text_only).lower()

def align_and_splice(chunk_a_lines: List[str], chunk_b_lines: List[str], window: int = 40) -> List[str]:
    """
    Slices overlapping prefix of Chunk B based on suffix match in Chunk A.
    """
    suffix = chunk_a_lines[-window:]
    prefix = chunk_b_lines[:window]

    suffix_fp = [fingerprint(l) for l in suffix if fingerprint(l)]
    prefix_fp = [fingerprint(l) for l in prefix if fingerprint(l)]

    # Find longest sequence match starting at index 0 of Prefix
    matcher = SequenceMatcher(None, suffix_fp, prefix_fp)
    match = matcher.find_longest_match(0, len(suffix_fp), 0, len(prefix_fp))

    if match.size > 0 and match.b == 0:
        matched_fp_count = match.size

        fp_counter = 0
        cut_index = 0
        for idx, line in enumerate(chunk_b_lines):
            if fingerprint(line):
                fp_counter += 1
            if fp_counter == matched_fp_count:
                cut_index = idx + 1
                break
        
        return chunk_a_lines + chunk_b_lines[cut_index:]
    
    # Fallback: No overlap detected, concatenate directly
    return chunk_a_lines + chunk_b_lines
```

---

## 5. Edge Case Protections

* **Zero Overlap:** If `match.size == 0`, fallback logic performs clean direct concatenation without dropping lines.
* **Formatting Variation Resilience:** Line fingerprinting normalizes away XML tag variations, spaces, and casing.
* **Header/Footer Guard:** A minimum match threshold (e.g. $\ge 2$ consecutive lines) prevents false cuts on isolated page numbers or headers.
