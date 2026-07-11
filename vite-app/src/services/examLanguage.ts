import type { Exam, Question, Option } from "@/types/exam";

export function parseExamLanguage(text: string): Omit<Exam, "id" | "created_at"> {
  const lines = text.split(/\r?\n/);
  
  let title = "Đề Thi Mới";
  let subject = "Toán Học";
  let grade = "Lớp 12";
  let duration_minutes = 45;
  
  const questions: Question[] = [];
  const stimuli: Record<string, string> = {};
  
  let currentBlockType: "meta" | "stimulus" | "question" = "meta";
  let currentStimulusId = "";
  let currentStimulusText = "";
  
  let currentQ: Partial<Question> & { options: Option[] } = {
    id: "",
    question_number: "",
    stem: "",
    options: [],
    correct_answer: "A",
    explanation: "",
    stimulus_id: "",
    stimulus_text: "",
  };
  
  const commitQuestion = () => {
    if (currentQ.stem || currentQ.options.length > 0) {
      const qId = currentQ.id || `q_${questions.length + 1}_${Math.random().toString(36).substring(2, 8)}`;
      const qNum = currentQ.question_number || `Câu ${questions.length + 1}`;
      
      let stem = currentQ.stem?.trim() || "";
      
      // Extract inline options (e.g. (A). ... (B). ... ) if no separate option lines were matched
      if (currentQ.options.length === 0 && stem) {
        const inlineRegex = /(?:\s+|^)[\(\[]?([A-D])[\)\]\.]+\s+(.*?)(?=\s+[\(\[]?[A-D][\)\]\.]+\s+|$)/gi;
        let match;
        let firstIndex = -1;
        const tempOptions: Option[] = [];
        
        while ((match = inlineRegex.exec(stem)) !== null) {
          if (firstIndex === -1) {
            firstIndex = match.index;
          }
          tempOptions.push({
            label: match[1].toUpperCase(),
            text: match[2].trim()
          });
        }
        
        if (tempOptions.length >= 3) {
          currentQ.options = tempOptions;
          stem = stem.substring(0, firstIndex).trim();
        }
      }
      
      const stimulusId = currentQ.stimulus_id || "";
      const stimulusText = stimulusId ? (stimuli[stimulusId] || "") : "";
      
      // Enforce at least standard options if empty
      const finalOptions = currentQ.options.length > 0 ? currentQ.options : [
        { label: "A", text: "Phương án A" },
        { label: "B", text: "Phương án B" },
        { label: "C", text: "Phương án C" },
        { label: "D", text: "Phương án D" }
      ];

      questions.push({
        id: qId,
        question_number: qNum,
        stem: stem,
        options: finalOptions,
        correct_answer: currentQ.correct_answer || "A",
        explanation: currentQ.explanation?.trim() || "",
        stimulus_id: stimulusId,
        stimulus_text: stimulusText,
      });
    }
    
    currentQ = {
      id: "",
      question_number: "",
      stem: "",
      options: [],
      correct_answer: "A",
      explanation: "",
      stimulus_id: "",
      stimulus_text: "",
    };
  };

  const commitStimulus = () => {
    if (currentStimulusId && currentStimulusText.trim()) {
      stimuli[currentStimulusId] = currentStimulusText.trim();
    }
    currentStimulusId = "";
    currentStimulusText = "";
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed && currentBlockType === "meta") continue;
    
    if (trimmed.toLowerCase().startsWith("title:")) {
      title = line.substring(line.indexOf(":") + 1).trim();
      continue;
    }
    if (trimmed.toLowerCase().startsWith("subject:")) {
      subject = line.substring(line.indexOf(":") + 1).trim();
      continue;
    }
    if (trimmed.toLowerCase().startsWith("grade:")) {
      grade = line.substring(line.indexOf(":") + 1).trim();
      continue;
    }
    if (trimmed.toLowerCase().startsWith("duration:")) {
      duration_minutes = parseInt(line.substring(line.indexOf(":") + 1).trim(), 10) || 45;
      continue;
    }
    
    if (trimmed.toLowerCase() === "[stimulus]") {
      if (currentBlockType === "question") commitQuestion();
      if (currentBlockType === "stimulus") commitStimulus();
      currentBlockType = "stimulus";
      continue;
    }
    
    if (trimmed.toLowerCase() === "[question]") {
      if (currentBlockType === "question") commitQuestion();
      if (currentBlockType === "stimulus") commitStimulus();
      currentBlockType = "question";
      continue;
    }
    
    if (currentBlockType === "stimulus") {
      if (trimmed.toLowerCase().startsWith("id:")) {
        currentStimulusId = trimmed.substring(3).trim();
      } else {
        currentStimulusText += (currentStimulusText ? "\n" : "") + line;
      }
    } else if (currentBlockType === "question") {
      if (trimmed.toLowerCase().startsWith("id:")) {
        currentQ.id = trimmed.substring(3).trim();
      } else if (trimmed.toLowerCase().startsWith("refer:")) {
        currentQ.stimulus_id = trimmed.substring(6).trim();
      } else if (trimmed.toLowerCase().startsWith("answer:") || trimmed.toLowerCase().startsWith("correct:")) {
        currentQ.correct_answer = trimmed.substring(trimmed.indexOf(":") + 1).trim().toUpperCase();
      } else if (trimmed.toLowerCase().startsWith("explanation:")) {
        currentQ.explanation = line.substring(line.toLowerCase().indexOf("explanation:") + 12).trim();
      } else {
        const optionMatch = trimmed.match(/^(?:(?:\(?([A-D])\s*[\.\/])|(?:\(([A-D])\))|(?:\[([A-D])\]))\s+(.*)$/i);
        if (optionMatch) {
          const label = (optionMatch[1] || optionMatch[2] || optionMatch[3]).toUpperCase();
          const text = optionMatch[4].trim();
          currentQ.options.push({ label, text });
        } else {
          // Appending to explanation if explanation has started, otherwise stem
          if (currentQ.explanation !== undefined && currentQ.explanation !== "") {
            currentQ.explanation += "\n" + line;
          } else {
            if (!currentQ.question_number) {
              const match = trimmed.match(/^(\**(?:Câu|Question|\d+)?\s*\d+\**[\.\:\*]*)\s*(.*)/i);
              if (match) {
                currentQ.question_number = match[1].replace(/[\.\:\*]/g, "").trim();
                currentQ.stem = match[2].trim();
              } else {
                currentQ.stem = (currentQ.stem ? currentQ.stem + "\n" : "") + line;
              }
            } else {
              currentQ.stem = (currentQ.stem ? currentQ.stem + "\n" : "") + line;
            }
          }
        }
      }
    }
  }
  
  if (currentBlockType === "question") commitQuestion();
  if (currentBlockType === "stimulus") commitStimulus();
  
  return {
    title,
    subject,
    grade,
    duration_minutes,
    questions,
  };
}

export function serializeExamLanguage(exam: Exam): string {
  let text = "";
  text += `Title: ${exam.title}\n`;
  text += `Subject: ${exam.subject}\n`;
  text += `Grade: ${exam.grade}\n`;
  text += `Duration: ${exam.duration_minutes}\n\n`;
  
  const printedStimuli = new Set<string>();
  
  for (const q of exam.questions) {
    if (q.stimulus_id && q.stimulus_text && !printedStimuli.has(q.stimulus_id)) {
      text += `[Stimulus]\n`;
      text += `Id: ${q.stimulus_id}\n`;
      text += `${q.stimulus_text.trim()}\n\n`;
      printedStimuli.add(q.stimulus_id);
    }
    
    text += `[Question]\n`;
    if (q.stimulus_id) {
      text += `Refer: ${q.stimulus_id}\n`;
    }
    text += `${q.question_number}: ${q.stem.trim()}\n`;
    for (const opt of q.options) {
      text += `${opt.label}. ${opt.text}\n`;
    }
    text += `Answer: ${q.correct_answer}\n`;
    if (q.explanation) {
      text += `Explanation: ${q.explanation.trim()}\n`;
    }
    text += `\n`;
  }
  
  return text.trim();
}
