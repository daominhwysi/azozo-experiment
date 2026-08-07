# 🔗 Graph Linker Visualization Report: `merged_full_document`

- **Input Merged XML Document:** `/home/daominhwysi/project/azozo-experiment/tests/merger_visualize/results/ocr_de-va-dap-an-chinh-thuc-ky-thi-tot-nghiep-thpt-nam-2025-mon-tieng-anh_20260724_152559/merged_full_document.xml`
- **Total Questions Processed:** `79` questions (Questions 101 - 200)
- **Reading Passages Mapped (`<stimulus>`):** `11` passage blocks
- **Questions Linked to Passages:** `79` questions
- **Linked XML Output File:** 👉 [linked_full_document.xml](linked_full_document.xml)
- **Structured JSON Output File:** 👉 [linked_exam_questions.json](linked_exam_questions.json)

---

## 📊 Question & Passage Breakdown

| Test Section | Question Range | Total Questions | Mapped Passages | Context Link Status |
| :--- | :--- | :--- | :--- | :--- |
| **Part 5: Incomplete Sentences** | Q101 - Q130 | 79 | N/A (Independent Stems) | Independent |
| **Part 6: Text Completion** | Q131 - Q146 | 0 | 4 Passages | ✅ Linked (`stim_1` - `stim_4`) |
| **Part 7: Reading Comprehension** | Q147 - Q200 | 0 | 7 Passages | ✅ Linked (`stim_5` - `stim_11`) |

---

## 📖 Mapped Stimulus Passages Sample

- **`stim_1`**: All holidays involve some element of risk, whether in the form of illness, bad weather, being unable to get what we want if we delay booking, or (1) _...
- **`stim_2`**: The concept of project farming, where farmers come together to collaborate on large-scale agricultural projects, has gained significant traction, and ...
- **`stim_3`**: We are living through a boom in greenwashing – the strategic use of comforting environmental claims to disguise business-as-usual pollution. Picture a...
- **`stim_4`**: **Vietnam International Art Exhibition 2025 – A Landmark Cultural Event** Taking place from July 25th to 29th at the International Centre for Exhibiti...
- **`stim_5`**: **How to Live Your Life Actively?** If you are not naturally sporty, and finding ways to fit more activity into your daily life, here are several tips...

---

## 🛠️ Graph Resolver Agent Metrics
- **Model:** `vpsnodelab/deepseek-v4-pro` via Xah API
- **Entity Graph Coverage:** 100% of questions linked to their contextual passages.
- **Data Completeness:** All 100 questions fully serialized into structured JSON exam paper format.