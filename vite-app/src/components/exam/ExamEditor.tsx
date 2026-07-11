import { useState, useEffect, useMemo, useRef } from "react";
import type { Exam, Question } from "@/types/exam";
import { parseExamLanguage, serializeExamLanguage } from "@/services/examLanguage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, X, FileText, CheckCircle, AlertTriangle, Eye, Clock } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useTheme } from "@/components/theme-provider";

// Custom theme colors matching Azozo's Notion aesthetic
const setupMonacoAelLanguage = (monaco: Monaco) => {
  // Check if language already registered to prevent duplicates
  if (monaco.languages.getLanguages().some((lang: any) => lang.id === "ael")) {
    return;
  }

  // Register custom language ID 'ael'
  monaco.languages.register({ id: "ael" });

  // Define tokenizer
  monaco.languages.setMonarchTokensProvider("ael", {
    tokenizer: {
      root: [
        // Metadata lines
        [/^(Title|Subject|Grade|Duration)(\s*:\s*)(.*)$/, ["keyword.meta", "operator", "string.meta"]],

        // [Question] Tag
        [/^\[Question\]\s*$/, "keyword.tag"],

        // Options A. B. C. D.
        [/^\s*[A-D]\.\s+/, "variable.option"],

        // Answers
        [/^(Answer)(\s*:\s*)([A-D]\s*)$/, ["keyword.answer", "operator", "number.answer"]],

        // Explanations
        [/^(Explanation)(\s*:\s*)(.*)$/, ["keyword.explanation", "operator", "string.explanation"]],
      ],
    },
  });

  // Autocomplete Suggestions
  monaco.languages.registerCompletionItemProvider("ael", {
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        {
          label: "[Question] Block",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "[Question]\nQuestion ${1:1}: ${2:text}\nA. ${3:Option A}\nB. ${4:Option B}\nC. ${5:Option C}\nD. ${6:Option D}\nAnswer: ${7:A}\nExplanation: ${8:explanation text}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Insert a standard multiple choice question template",
          range,
        },
        {
          label: "Title:",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: "Title: ${1:Exam Title}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "Subject:",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: "Subject: ${1:Mathematics}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "Grade:",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: "Grade: ${1:Grade 12}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "Duration:",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: "Duration: ${1:45}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
      ];

      return { suggestions };
    },
  });

  // Dark Theme
  monaco.editor.defineTheme("aelThemeDark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.meta", foreground: "f87171", fontStyle: "bold" },
      { token: "string.meta", foreground: "e2e8f0" },
      { token: "keyword.tag", foreground: "facc15", fontStyle: "bold" },
      { token: "variable.option", foreground: "60a5fa", fontStyle: "bold" },
      { token: "keyword.answer", foreground: "4ade80", fontStyle: "bold" },
      { token: "number.answer", foreground: "4ade80" },
      { token: "keyword.explanation", foreground: "a78bfa", fontStyle: "bold" },
      { token: "string.explanation", foreground: "cbd5e1" },
    ],
    colors: {
      "editor.background": "#121212",
      "editor.lineHighlightBackground": "#1e1e1e",
    },
  });

  // Light Theme
  monaco.editor.defineTheme("aelThemeLight", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword.meta", foreground: "dc2626", fontStyle: "bold" },
      { token: "string.meta", foreground: "1f2937" },
      { token: "keyword.tag", foreground: "d97706", fontStyle: "bold" },
      { token: "variable.option", foreground: "2563eb", fontStyle: "bold" },
      { token: "keyword.answer", foreground: "16a34a", fontStyle: "bold" },
      { token: "number.answer", foreground: "16a34a" },
      { token: "keyword.explanation", foreground: "7c3aed", fontStyle: "bold" },
      { token: "string.explanation", foreground: "4b5563" },
    ],
    colors: {
      "editor.background": "#fafafa",
      "editor.lineHighlightBackground": "#f3f4f6",
    },
  });
};

// Custom hook to debounce state updates
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface ExamEditorProps {
  exam: Exam | null;
  onSave: (examData: Omit<Exam, "id" | "created_at">) => Promise<void>;
  onCancel: () => void;
}

export function ExamEditor({ exam, onSave, onCancel }: ExamEditorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const editorTheme = isDark ? "aelThemeDark" : "aelThemeLight";

  const editorRef = useRef<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [markupText, setMarkupText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // Debounce keypress changes by 350ms to optimize re-rendering and parsing calculations
  const debouncedMarkupText = useDebounce(markupText, 350);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  // Initialize markup text from exam
  useEffect(() => {
    let initialText = "";
    if (exam) {
      initialText = serializeExamLanguage(exam);
    } else {
      initialText = 
`Title: Midterm Assessment Exam
Subject: Mathematics
Grade: Grade 12
Duration: 60

[Question]
Question 1: Given the function f(x) = x^3 - 3x. How many critical points does f(x) have?
A. 0
B. 1
C. 2
D. 3
Answer: C
Explanation: The derivative is f'(x) = 3x^2 - 3. f'(x) = 0 yields x = ±1. Thus, the function has 2 critical points.

[Question]
Question 2: What is the derivative of g(x) = ln(x) for x > 0?
A. 1/x
B. e^x
C. x
D. 1/(x^2)
Answer: A
Explanation: According to the fundamental rules of calculus, d/dx(ln x) = 1/x.`;
    }

    setMarkupText(initialText);
    if (editorRef.current && editorRef.current.getValue() !== initialText) {
      editorRef.current.setValue(initialText);
    }
  }, [exam]);

  // Live parse AEL markup (debounced to avoid performance lag)
  const parsedExam = useMemo(() => {
    try {
      const parsed = parseExamLanguage(debouncedMarkupText);
      setParseError(null);
      return parsed;
    } catch (err: any) {
      setParseError("Syntax warning: " + (err?.message || "Verify your tags [Question] and options layout."));
      return null;
    }
  }, [debouncedMarkupText]);

  const handleSaveAll = async () => {
    if (!parsedExam) {
      alert("Please fix syntax errors before saving the exam.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(parsedExam);
    } catch (err) {
      console.error(err);
      setParseError(err instanceof Error ? err.message : "Failed to save the exam.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
        <div>
          <h1 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="h-4.5 w-4.5 text-primary" />
            Azozo AEL Split Editor
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Author assessments in real-time. Write Azozo Exam Language markup on the left; review rendering on the right.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="h-8 gap-1.5 text-xs">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSaveAll} disabled={isSaving || !parsedExam} className="h-8 gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" /> {isSaving ? "Saving..." : "Save Exam"}
          </Button>
        </div>
      </div>

      {/* Split Panels Container */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 border border-border rounded-xl bg-card overflow-hidden">
        {/* Left Side: Plaintext Editor */}
        <div className="flex flex-col flex-1 h-full min-w-0 border-b lg:border-b-0 lg:border-r border-border">
          <div className="py-2.5 px-4 border-b border-border/60 bg-muted/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" /> Plaintext Editor (AEL)
            </div>
            
            {parsedExam ? (
              <span className="text-[10px] text-green-600 bg-green-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                <CheckCircle className="h-3 w-3" /> Valid Markup
              </span>
            ) : (
              <span className="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-3 w-3" /> Syntax Alert
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 relative flex flex-col">
            <Editor
              height="100%"
              defaultLanguage="ael"
              theme={editorTheme}
              defaultValue={markupText}
              onChange={(val) => setMarkupText(val || "")}
              beforeMount={setupMonacoAelLanguage}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                fontSize: 12,
                lineHeight: 20,
                fontFamily: "var(--font-mono, monospace)",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 12, bottom: 12 },
              }}
            />

            {/* Error Message Box inside editor area bottom */}
            {parseError && (
              <div className="p-2 border-t border-border bg-destructive/10 text-destructive text-[10px] font-mono leading-normal shrink-0">
                {parseError}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Live Render Preview */}
        <div className="flex flex-col flex-1 h-full min-w-0 bg-background/10">
          <div className="py-2.5 px-4 border-b border-border/60 bg-muted/20 flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
            <Eye className="h-3.5 w-3.5" /> Live Render Preview
          </div>

          <ScrollArea className="flex-1 p-6 md:p-8 min-h-0 bg-background/50">
            {parsedExam ? (
              <div className="space-y-6">
                {/* Notion Style Header Cover/Card */}
                <div className="space-y-3 pb-4 border-b border-border/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{parsedExam.subject}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{parsedExam.grade}</Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                      <Clock className="h-3 w-3" /> {parsedExam.duration_minutes} mins
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-foreground tracking-tight leading-snug">
                    {parsedExam.title}
                  </h2>
                  <p className="text-[10px] text-muted-foreground">
                    Total questions: <span className="font-semibold text-foreground">{parsedExam.questions.length} items</span>
                  </p>
                </div>

                {/* Rendered Questions */}
                <div className="space-y-6 divide-y divide-border/30">
                  {parsedExam.questions.map((q: Question, idx: number) => {
                    return (
                      <div key={q.id || idx} className="pt-4 first:pt-0 space-y-2">
                        {/* Stimulus readout */}
                        {q.stimulus_text && (
                          <div className="p-3 bg-muted/40 border-l-3 border-primary/40 rounded-r-lg text-xs text-muted-foreground font-mono leading-relaxed italic mb-2">
                            {q.stimulus_text}
                          </div>
                        )}

                        {/* Stem */}
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-primary select-none pt-0.5">
                            {q.question_number || `Question ${idx + 1}`}:
                          </span>
                          <p className="text-xs font-medium text-foreground leading-relaxed flex-1">
                            {q.stem}
                          </p>
                        </div>

                        {/* Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-6 pt-1">
                          {q.options.map((opt) => {
                            const isCorrect = opt.label === q.correct_answer;
                            return (
                              <div
                                key={opt.label}
                                className={`p-2 rounded-lg border text-xs flex items-center gap-2 select-none ${
                                  isCorrect
                                    ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400 font-semibold"
                                    : "border-border/60 bg-card text-muted-foreground"
                                }`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] border ${
                                  isCorrect ? "bg-green-500 text-white border-green-500" : "bg-muted text-muted-foreground border-border"
                                }`}>
                                  {opt.label}
                                </span>
                                <span className="flex-1 truncate">{opt.text || "..."}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation preview */}
                        {q.explanation && (
                          <div className="mt-2 ml-6 p-2 bg-muted/20 border-l-2 border-border/80 text-[10px] text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground/80">Explanation: </span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-20">
                <AlertTriangle className="h-8 w-8 text-amber-500/80 mb-2" />
                <p className="text-xs font-semibold">Preview Unavailable</p>
                <p className="text-[10px] text-muted-foreground max-w-xs mt-1 leading-relaxed">
                  The parser is currently experiencing issues. Please correct your formatting on the left pane to restore the live view.
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
