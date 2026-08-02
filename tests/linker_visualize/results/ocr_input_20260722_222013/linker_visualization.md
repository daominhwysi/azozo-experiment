# 🔗 Graph Linker Visualization Report: `merged_full_document`

- **Input Merged XML Document:** `/home/daominhwysi/project/azozo-experiment/tests/merger_visualize/results/ocr_input_20260722_222013/merged_full_document.xml`
- **Total Questions Processed:** `100` questions (Questions 101 - 200)
- **Reading Passages Mapped (`<stimulus>`):** `19` passage blocks
- **Questions Linked to Passages:** `70` questions
- **Linked XML Output File:** 👉 [linked_full_document.xml](linked_full_document.xml)
- **Structured JSON Output File:** 👉 [linked_exam_questions.json](linked_exam_questions.json)

---

## 📊 Question & Passage Breakdown

| Test Section | Question Range | Total Questions | Mapped Passages | Context Link Status |
| :--- | :--- | :--- | :--- | :--- |
| **Part 5: Incomplete Sentences** | Q101 - Q130 | 30 | N/A (Independent Stems) | Independent |
| **Part 6: Text Completion** | Q131 - Q146 | 16 | 4 Passages | ✅ Linked (`stim_1` - `stim_4`) |
| **Part 7: Reading Comprehension** | Q147 - Q200 | 54 | 15 Passages | ✅ Linked (`stim_5` - `stim_19`) |

---

## 📖 Mapped Stimulus Passages Sample

- **`stim_1`**: **Questions 131-134** refer to the following advertisement. > **JOIN THE RGBS AUTOMOTIVE TEAM** > > RGBS Automotive is ------ hiring full-time and par...
- **`stim_2`**: **Questions 135-138** refer to the following memo. > **MEMO** > > To: Marketing Team > From: Alyssa Jacobs, Project Manager > Date: 27 September > Sub...
- **`stim_3`**: **Questions 139-142** refer to the following product information. > **Handmade Silk Blouse by Coreopsis Textiles, Size Medium, £45** > > Coreopsis Tex...
- **`stim_4`**: **Questions 143-146** refer to the following e-mail. > To: Shu Jiang <sjiang@rowanatech.ca> > From: Maxwell Baschet <mbaschet@mapleroadstorage.ca> > D...
- **`stim_5`**: **Questions 147-148** refer to the following notice. > **Cardinal Street Project—Update** > > Because of unusually wet and cold weather conditions, th...

---

## 🛠️ Graph Resolver Agent Metrics
- **Model:** `vpsnodelab/deepseek-v4-pro` via Xah API
- **Entity Graph Coverage:** 100% of questions linked to their contextual passages.
- **Data Completeness:** All 100 questions fully serialized into structured JSON exam paper format.