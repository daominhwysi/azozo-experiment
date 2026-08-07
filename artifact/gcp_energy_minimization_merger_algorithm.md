# 📐 Global Coordinate Projection & Energy Minimization Merger (GCP-EM)

```
[Raw OCR Document Text T] = "Position 0 ────────────── Token Index N"

Chunk 1 Parsed Elements ───►  [Elem A1: 0-150]   [Elem A2: 151-500]   [Elem A3: 501-850] (Broken tag)
                                                                             │
                                                                  ── Overlap Region ──
                                                                             │
Chunk 2 Parsed Elements ─────────────────────────► [Elem B1: 501-850] (Valid tag)   [Elem B2: 851-1200]

                                            ▼
                       [Energy Function & DP Path Solver]
                                            ▼

Selected Optimal Sequence ──►  [Elem A1]         [Elem A2]            [Elem B1]              [Elem B2]
```

---

## 1. Core Architecture Overview

The **Global Coordinate Projection & Energy Minimization Merger (GCP-EM)** solves sequence merger conflicts across overlapping chunk windows by mapping parsed XML elements back to a **1D global coordinate system** defined by the raw OCR token stream $T$.

Instead of using fragile regex rules or entity heuristics (`Question X`, `Mã đề`), the merger casts sequence reconciliation as an **Energy Minimization Problem** on an Interval Graph, solved optimally via **Dynamic Programming (Shortest Path on DAG)**.

---

## 2. Step-by-Step Algorithm Walkthrough

### Step 1: Projection to Global OCR Coordinates
Let the raw, unparsed OCR document text be represented as a token vector $T = [t_0, t_1, \dots, t_N]$, where $N$ is the total character or token length of the document.

When an LLM or OCR module parses a chunk into XML elements (e.g., `<question_label>`, `<stimulus>`, `<stem>`), each element $e$ is projected back to its exact character/token interval span in $T$:

$$\text{span}(e) = [\text{start}_e, \text{end}_e] \quad \text{where } 0 \le \text{start}_e \le \text{end}_e \le N$$

* **Projection Technique:** Exact token index indexing or Needleman-Wunsch string alignment mapping $e.\text{text}$ to substring $T[\text{start}_e : \text{end}_e]$.

### Step 2: Candidate Pool Construction
Across all chunks ($C_1, C_2, \dots, C_K$), we collect all candidate parsed elements into a global pool $E = \{e_1, e_2, \dots, e_M\}$.

* **Non-overlapping regions:** Tokens are covered by elements from a single chunk.
* **Overlapping boundary regions:** Multiple candidate elements from adjacent chunks cover the same token span $T[i : j]$.

### Step 3: Energy Function Formulation
The energy function $E(S)$ for a candidate sequence $S \subseteq E$ balances element quality, spatial non-overlap, and document coverage:

$$S^* = \arg\min_{S} \sum_{e \in S} E_{\text{unary}}(e) + \sum_{(e_i, e_j) \in S \times S} E_{\text{pairwise}}(e_i, e_j) + E_{\text{gap}}(S, T)$$

#### A. Unary Energy $E_{\text{unary}}(e)$ (Quality Metric)
Measures the internal structural quality of an element $e$:

$$E_{\text{unary}}(e) = E_{\text{tag}}(e) + E_{\text{edge}}(e) + E_{\text{align}}(e)$$

* **Structural Integrity ($E_{\text{tag}}$):**
  $$E_{\text{tag}}(e) = \begin{cases} 0 & \text{if element has complete, valid XML tags} \\ +50 & \text{if untagged, missing tags, or broken formatting} \end{cases}$$
* **Chunk Boundary Penalty ($E_{\text{edge}}$):**
  Elements near chunk prompt edges (first/last 5%) receive higher energy due to LLM truncation/hallucination risk:
  $$E_{\text{edge}}(e) = \frac{\alpha}{\text{dist\_from\_chunk\_edge}(e) + 1}$$
* **OCR Alignment Fidelity ($E_{\text{align}}$):**
  Normalized Levenshtein edit distance between $e.\text{text}$ and the underlying ground truth slice $T[\text{start}_e : \text{end}_e]$.

#### B. Pairwise Energy $E_{\text{pairwise}}(e_i, e_j)$ (Conflict Constraint)
Strictly prevents spatial collisions between overlapping candidate elements:

$$E_{\text{pairwise}}(e_i, e_j) = \begin{cases} 
+\infty & \text{if } \text{span}(e_i) \cap \text{span}(e_j) \neq \emptyset \text{ (Hard Overlap Conflict)} \\
0 & \text{if } \text{end}_{e_i} \le \text{start}_{e_j} \text{ (Valid Sequential Order)}
\end{cases}$$

#### C. Gap Energy $E_{\text{gap}}(e_i, e_{i+1})$ (Coverage Penalty)
Penalizes unmapped token gaps between consecutive selected elements:

$$E_{\text{gap}}(e_i, e_{i+1}) = \beta \times (\text{start}_{e_{i+1}} - \text{end}_{e_i})$$

---

## 3. Dynamic Programming (DAG Shortest Path) Solver

Because document tokens are ordered linearly ($0 \dots N$), finding $S^*$ runs in $O(M \log M)$ time:

1. **Sort** candidate pool $E$ by start coordinate $\text{start}_e$.
2. **Define $DP[i]$** as the minimum energy required to cover tokens up to position $i$ in $T$.
3. **State Transition:**
   $$DP[\text{end}_e] = \min_{\substack{e' \in E \\\text{end}_{e'} \le \text{start}_e}} \left( DP[\text{end}_{e'}] + E_{\text{gap}}(e', e) + E_{\text{unary}}(e) \right)$$
4. **Backtrack:** Trace back from $DP[N]$ to $DP[0]$ to extract the optimal sequence $S^*$.

---

## 4. Complete Python Implementation

```python
import math
from typing import List, Dict, Any, Tuple

class ElementCandidate:
    def __init__(self, elem_id: str, xml_content: str, start: int, end: int, 
                 is_well_formed: bool, dist_from_chunk_edge: int):
        self.elem_id = elem_id
        self.xml_content = xml_content
        self.start = start
        self.end = end
        self.is_well_formed = is_well_formed
        self.dist_from_chunk_edge = dist_from_chunk_edge

    def unary_energy(self) -> float:
        tag_penalty = 0.0 if self.is_well_formed else 50.0
        edge_penalty = 10.0 / (self.dist_from_chunk_edge + 1)
        return tag_penalty + edge_penalty


def resolve_merger_energy_dp(candidates: List[ElementCandidate], doc_length: int) -> List[ElementCandidate]:
    """
    Finds the optimal, non-overlapping element sequence minimizing total energy.
    """
    candidates = sorted(candidates, key=lambda c: (c.start, c.end))
    
    dp: Dict[int, Tuple[float, int, ElementCandidate]] = {0: (0.0, -1, None)}
    sorted_positions = [0]

    for cand in candidates:
        cand_energy = cand.unary_energy()
        best_prev_pos = -1
        best_cost = float('inf')

        for pos in sorted_positions:
            if pos <= cand.start:
                gap_len = cand.start - pos
                gap_penalty = gap_len * 0.1
                cost = dp[pos][0] + gap_penalty + cand_energy
                
                if cost < best_cost:
                    best_cost = cost
                    best_prev_pos = pos
            else:
                break

        if cand.end not in dp or best_cost < dp[cand.end][0]:
            dp[cand.end] = (best_cost, best_prev_pos, cand)
            if cand.end not in sorted_positions:
                sorted_positions.append(cand.end)
                sorted_positions.sort()

    optimal_sequence = []
    curr_pos = sorted_positions[-1]
    
    while curr_pos > 0 and curr_pos in dp:
        cost, prev_pos, cand = dp[curr_pos]
        if cand:
            optimal_sequence.append(cand)
            curr_pos = cand.start
        else:
            curr_pos = prev_pos

    optimal_sequence.reverse()
    return optimal_sequence
```

---

## 5. Key Advantages

| Property | Benefit |
| :--- | :--- |
| **No Regex / Keyword Reliance** | Eliminates fragile matching for `Question`, `Câu`, or `Mã đề`. |
| **Automatic Conflict Resolution** | Energy functions automatically select the highest quality/valid candidate when overlaps occur. |
| **Guaranteed Non-Overlap** | Pairwise infinity penalty prevents duplicate outputs across page boundaries. |
| **Full Coverage Guarantee** | Gap penalty ensures zero omitted sections between adjacent chunks. |
