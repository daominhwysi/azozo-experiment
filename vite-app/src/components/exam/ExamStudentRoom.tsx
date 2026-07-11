import { useState, useEffect, useMemo, Fragment, useRef, useCallback, memo } from "react";
import type { Exam, Question, TestResult } from "@/types/exam";
import { submitExam } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Clock, Check, RefreshCw, Play, X, Copy } from "lucide-react";

interface ExamStudentRoomProps {
  exams: Exam[];
  selectedExam: Exam | null;
  onSelectExam?: (exam: Exam) => void;
  isTestRunning: boolean;
  setIsTestRunning: (running: boolean) => void;
  onBack?: () => void;
}

interface StimulusGroup {
  stimulus?: string;
  questions: Question[];
}

function groupByStimulus(questions: Question[]): StimulusGroup[] {
  const groups: StimulusGroup[] = [];
  for (const q of questions) {
    const stim = q.stimulus_text || undefined;
    const last = groups[groups.length - 1];
    if (last && last.stimulus === stim) {
      last.questions.push(q);
    } else {
      groups.push({ stimulus: stim, questions: [q] });
    }
  }
  return groups;
}

function stripMarkdown(text: string | undefined | null): string {
  if (!text) return "";
  return text
    // Remove headers
    .replace(/^#+\s+/gm, '')
    // Remove bold/italic formatting
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove inline code block formatting
    .replace(/`([^`]+)`/g, '$1')
    // Remove links
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove blockquotes
    .replace(/^\s*>\s+/gm, '')
    // Remove list markers
    .replace(/^\s*[\-\*\+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .trim();
}

function renderTextWithTables(text: string | undefined | null): React.ReactNode {
  if (!text) return "";

  const parts = text.split(/(<table[\s\S]*?<\/table>)/i);
  return (
    <>
      {parts.map((part, index) => {
        if (part.trim().toLowerCase().startsWith("<table")) {
          return (
            <div
              key={`html-table-${index}`}
              className="overflow-x-auto my-3 border border-border/80 rounded-lg text-[11px] md:text-xs text-left text-muted-foreground [&_table]:min-w-full [&_table]:divide-y [&_table]:divide-border [&_th]:bg-muted/40 [&_th]:font-semibold [&_th]:text-foreground [&_th]:px-3 [&_th]:py-2 [&_th]:border-r [&_th]:border-border/40 [&_th]:last:border-r-0 [&_td]:px-3 [&_td]:py-2 [&_td]:border-r [&_td]:border-border/40 [&_td]:last:border-r-0 [&_tr]:hover:bg-muted/20 [&_tbody]:divide-y [&_tbody]:divide-border/30 [&_tbody]:bg-card"
              dangerouslySetInnerHTML={{ __html: part }}
            />
          );
        } else {
          return renderMarkdownTablesOnly(part, index);
        }
      })}
    </>
  );
}

function renderMarkdownTablesOnly(text: string, partIndex: number): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentTableRows: string[][] = [];
  let isInsideTable = false;

  const flushTable = (key: string | number) => {
    if (currentTableRows.length === 0) return;

    const isSeparatorRow = (row: string[]) => {
      const joinStr = row.join("").trim();
      return /^[|\-:\s]+$/.test(joinStr) && joinStr.includes("-");
    };

    const hasSeparator = currentTableRows.some(isSeparatorRow);
    const cleanedRows = currentTableRows.filter(row => !isSeparatorRow(row));

    if (cleanedRows.length > 0) {
      const headerCandidate = cleanedRows[0];
      const isHeaderEmpty = headerCandidate.every(cell => !cell.trim());

      let headers: string[] = [];
      let bodyRows: string[][] = [];

      if (hasSeparator) {
        if (isHeaderEmpty) {
          headers = [];
          bodyRows = cleanedRows.slice(1);
        } else {
          headers = headerCandidate;
          bodyRows = cleanedRows.slice(1);
        }
      } else {
        headers = [];
        bodyRows = cleanedRows;
      }

      elements.push(
        <div key={`table-${partIndex}-${key}`} className="overflow-x-auto my-3 border border-border/80 rounded-lg">
          <table className="min-w-full divide-y divide-border text-[11px] md:text-xs text-left">
            {headers.length > 0 && (
              <thead className="bg-muted/40 font-semibold text-foreground">
                <tr>
                  {headers.map((cell, idx) => (
                    <th key={idx} className="px-3 py-2 border-r border-border/40 last:border-r-0">
                      {stripMarkdown(cell.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-border/30 bg-card">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/20">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 border-r border-border/40 last:border-r-0 text-muted-foreground">
                      {stripMarkdown(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    currentTableRows = [];
    isInsideTable = false;
  };

  let textAccumulator: string[] = [];
  const flushText = (key: string | number) => {
    if (textAccumulator.length > 0) {
      elements.push(
        <span key={`text-${partIndex}-${key}`} className="whitespace-pre-wrap block">
          {stripMarkdown(textAccumulator.join("\n"))}
        </span>
      );
      textAccumulator = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableRow = line.startsWith("|") && line.endsWith("|");
    const isDivider = /^[-*_]{3,}\s*$/.test(line);

    if (isTableRow) {
      if (!isInsideTable) {
        flushText(i);
        isInsideTable = true;
      }
      const cols = line.split("|").slice(1, -1).map(c => c.trim());
      currentTableRows.push(cols);
    } else if (isDivider) {
      if (isInsideTable) {
        flushTable(i);
      } else {
        flushText(i);
      }
      elements.push(<hr key={`divider-${partIndex}-${i}`} className="my-4 border-t border-border/80" />);
    } else {
      if (isInsideTable) {
        flushTable(i);
      }
      textAccumulator.push(lines[i]);
    }
  }

  if (isInsideTable) {
    flushTable("end");
  } else {
    flushText("end");
  }

  return <Fragment key={partIndex}>{elements}</Fragment>;
}


function StimulusBlock({ text }: { text: string }) {
  return (
    <div className="p-4 my-4 bg-muted/30 border-l-3 border-primary/40 rounded-r-lg text-xs md:text-sm text-foreground/80 leading-relaxed font-mono">
      {renderTextWithTables(text)}
    </div>
  );
}

const QuestionInteractiveRow = memo(function QuestionInteractiveRow({
  question,
  index,
  isTestRunning,
  selectedAnswer,
  onSelectOption,
}: {
  question: Question;
  index: number;
  isTestRunning: boolean;
  selectedAnswer?: string;
  onSelectOption: (qId: string, label: string) => void;
}) {
  const qNum = stripMarkdown(question.question_number);
  return (
    <div
      id={`question-${index}`}
      className="py-4 border-b border-border/40 last:border-b-0 space-y-3 scroll-mt-20"
    >
      <div className="flex items-start gap-2">
        <span className="text-xs md:text-sm font-bold text-primary shrink-0 select-none">
          {qNum || `Question ${index + 1}:`}
        </span>
        <div className="text-xs md:text-sm font-medium text-foreground leading-relaxed flex-1">
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pl-6 mt-2">
        {question.options.map((opt, oIdx) => {
          const isSelected = selectedAnswer === opt.label;
          const cleanLabel = stripMarkdown(opt.label);
          return (
            <button
              key={oIdx}
              type="button"
              disabled={!isTestRunning}
              onClick={() => onSelectOption(question.id, opt.label)}
              className={`text-left p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all w-full select-none ${
                isSelected
                  ? "border-primary bg-primary/5 text-foreground font-semibold"
                  : "border-border/60 bg-card hover:bg-muted/40 text-foreground cursor-pointer disabled:cursor-not-allowed"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 border ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border/60"
                }`}
              >
                {cleanLabel}
              </span>
              <span className="flex-1 leading-normal pt-0.5">{stripMarkdown(opt.text)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export function ExamStudentRoom({
  exams,
  selectedExam,
  onSelectExam,
  isTestRunning,
  setIsTestRunning,
  onBack,
}: ExamStudentRoomProps) {
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const studentName = "John Doe";
  const [timeRemaining, setTimeRemaining] = useState<number>(45 * 60);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(0);
  const isAutoScrollingRef = useRef(false);

  const activeExam = selectedExam || (exams.length > 0 ? exams[0] : null);

  // Deduplicate questions by ID to fix potential backend OCR duplications
  const questions = useMemo(() => {
    const rawQuestions = activeExam?.questions || [];
    return Array.from(new Map(rawQuestions.map((q) => [q.id, q])).values());
  }, [activeExam]);

  // Load draft answers from local storage
  useEffect(() => {
    if (activeExam && isTestRunning) {
      try {
        const saved = localStorage.getItem(`azozo_draft_${activeExam.id}`);
        if (saved) {
          setStudentAnswers(JSON.parse(saved));
        }
      } catch (e) {
        console.warn("Failed to restore draft from localStorage", e);
      }
    }
  }, [activeExam?.id, isTestRunning]);

  // Save draft answers to local storage on change
  useEffect(() => {
    if (activeExam && isTestRunning && Object.keys(studentAnswers).length > 0) {
      localStorage.setItem(`azozo_draft_${activeExam.id}`, JSON.stringify(studentAnswers));
    }
  }, [studentAnswers, activeExam?.id, isTestRunning]);

  // Scroll spy to highlight active question in map on scroll
  useEffect(() => {
    if (questions.length === 0 || testResult) return;

    const scrollContainer = document.querySelector("main");
    const observer = new IntersectionObserver(
      (entries) => {
        if (isAutoScrollingRef.current) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const match = id.match(/question-(\d+)/);
            if (match) {
              const idx = parseInt(match[1], 10);
              setActiveQuestionIdx(idx);
            }
          }
        });
      },
      {
        root: scrollContainer,
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      }
    );

    questions.forEach((_, idx) => {
      const el = document.getElementById(`question-${idx}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [questions, testResult]);

  // Timer Effect
  useEffect(() => {
    let interval: any = null;
    if (isTestRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (timeRemaining === 0 && isTestRunning) {
      handleCompleteExam();
    }
    return () => clearInterval(interval);
  }, [isTestRunning, timeRemaining]);

  const handleStartTest = () => {
    if (!activeExam) return;
    setStudentAnswers({});
    setTestResult(null);
    setActiveQuestionIdx(0);
    setTimeRemaining((activeExam.duration_minutes || 45) * 60);
    setIsTestRunning(true);
  };

  const handleSelectOption = useCallback((qId: string, label: string) => {
    if (!isTestRunning) return;
    setStudentAnswers((prev) => ({
      ...prev,
      [qId]: label,
    }));
  }, [isTestRunning]);

  const handleCompleteExam = async () => {
    if (!activeExam || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await submitExam(activeExam.id, studentName, studentAnswers);
      setTestResult(res);
      setIsTestRunning(false);
      localStorage.removeItem(`azozo_draft_${activeExam.id}`); // Clear draft on successful completion
    } catch (e) {
      console.error(e);
      alert("An error occurred while submitting the test!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAnswerSheet = () => {
    if (!testResult) return;
    let text = `EXAM RESULTS: ${testResult.exam_title}\n`;
    text += `Student: ${testResult.student_name}\n`;
    text += `Score: ${testResult.score}/10 (${testResult.correct_count}/${testResult.total_questions} correct)\n`;
    text += `Accuracy rate: ${testResult.percentage}%\n\n`;
    text += `GRADED BREAKDOWN:\n`;
    testResult.detailed_results.forEach((res, idx) => {
      const isCorrect = res.is_correct ? "CORRECT" : "INCORRECT";
      const studentAns = res.student_answer || "No response";
      const correctAns = res.correct_answer;
      text += `Question ${idx + 1}: Selected ${studentAns} - ${isCorrect}`;
      if (!res.is_correct) {
        text += ` (Correct answer: ${correctAns})`;
      }
      text += `\n`;
    });
    navigator.clipboard.writeText(text)
      .then(() => alert("Copied graded results to clipboard!"))
      .catch((err) => console.error("Failed to copy:", err));
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!activeExam) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs">
        No exams found in the catalog.
      </div>
    );
  }

  return (
    <div className={`space-y-6 mx-auto pb-12 relative ${isTestRunning ? "max-w-7xl px-2" : "max-w-5xl"}`}>

      {/* Notion Cover Backdrop */}
      <div className="h-28 w-full rounded-xl bg-gradient-to-r from-violet-500/20 via-primary/20 to-blue-500/20 border border-border/50 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-400/10 via-transparent to-transparent"></div>
        <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground font-mono bg-background/50 backdrop-blur-xs px-2 py-0.5 rounded border border-border/40">
          Assessment Canvas
        </div>
      </div>

      {/* Top Controls Header Card */}
      <div className="border border-border rounded-xl p-6 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 relative -mt-14 mx-4 shadow-xs backdrop-blur-md bg-background/95">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="text-3xl mb-1 select-none">📝</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{activeExam.subject}</Badge>
            <Badge variant="secondary" className="text-[10px]">{activeExam.grade}</Badge>
          </div>
          <h1 className="text-base font-bold text-foreground truncate mt-1">{activeExam.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {!isTestRunning && !testResult && (
            <>
              {onBack && (
                <Button variant="outline" onClick={onBack} className="h-9 px-3 text-xs font-semibold">
                  Back to Catalog
                </Button>
              )}

              <div className="flex items-center gap-2 border border-border px-3 py-1.5 rounded-lg bg-muted/30 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-semibold font-mono">
                  {activeExam.duration_minutes || 45} mins
                </span>
              </div>

              {onSelectExam && exams.length > 1 && (
                <select
                  value={activeExam.id}
                  onChange={(e) => {
                    const found = exams.find((x) => x.id === e.target.value);
                    if (found) onSelectExam(found);
                  }}
                  className="h-9 text-xs rounded-md border border-input bg-background px-2.5 font-medium text-foreground"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.subject})
                    </option>
                  ))}
                </select>
              )}
              <Button onClick={handleStartTest} className="gap-1.5 text-xs">
                <Play className="h-3.5 w-3.5" /> Start Exam
              </Button>
            </>
          )}

          {testResult && (
            <div className="flex items-center gap-2">
              {onBack && (
                <Button variant="outline" onClick={onBack} className="gap-1.5 text-xs font-semibold">
                  Back to Catalog
                </Button>
              )}
              <Button onClick={handleCopyAnswerSheet} variant="outline" className="gap-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" /> Copy Results
              </Button>
              <Button onClick={handleStartTest} variant="outline" className="gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Retake Exam
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Test Results Summary & Detailed Answer Sheet View */}
      {testResult && (
        <div className="space-y-6">
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-primary">
                🎉 Assessment Score Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg border border-border bg-background text-center">
                  <p className="text-muted-foreground text-[10px]">Score</p>
                  <p className="text-2xl font-bold text-primary">{testResult.score} / 10</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-background text-center">
                  <p className="text-muted-foreground text-[10px]">Correct Answers</p>
                  <p className="text-2xl font-bold text-foreground">
                    {testResult.correct_count} / {testResult.total_questions}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-background text-center">
                  <p className="text-muted-foreground text-[10px]">Accuracy Rate</p>
                  <p className="text-2xl font-bold text-foreground">{testResult.percentage}%</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-background text-center">
                  <p className="text-muted-foreground text-[10px]">Student Name</p>
                  <p className="text-base font-semibold text-foreground mt-1">
                    {testResult.student_name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left: Detailed review of each question */}
            <div className="flex-1 min-w-0 space-y-4 w-full">
              <div className="bg-card border border-border shadow-xs rounded-xl p-6 md:p-8">
                <h2 className="text-sm font-bold text-foreground mb-4">Assessment Graded Report</h2>
                <div className="divide-y divide-border/30">
                  {testResult.detailed_results.map((res, idx) => {
                    const qNum = stripMarkdown(res.question_number);
                    const prevRes = idx > 0 ? testResult.detailed_results[idx - 1] : null;
                    const showStimulus = res.stimulus_text && (!prevRes || prevRes.stimulus_text !== res.stimulus_text);
                    return (
                      <div key={res.question_id || idx} className="space-y-2">
                        {showStimulus && res.stimulus_text && (
                          <div className="mt-4 first:mt-0">
                            <StimulusBlock text={res.stimulus_text} />
                          </div>
                        )}
                        <div
                          id={`review-question-${idx}`}
                          className="py-4 border-b border-border/40 last:border-b-0 space-y-3 scroll-mt-20"
                        >
                          <div className="flex items-start gap-2">
                          <span className="text-xs md:text-sm font-bold text-primary shrink-0 select-none">
                            {qNum || `Question ${idx + 1}:`}
                          </span>
                          <div className="text-xs md:text-sm font-medium text-foreground leading-relaxed flex-1">
                            {renderTextWithTables(res.stem)}
                          </div>
                          <Badge variant={res.is_correct ? "default" : "destructive"} className="text-[10px] py-0 shrink-0">
                            {res.is_correct ? "Correct" : "Incorrect"}
                          </Badge>
                        </div>

                        <div className="space-y-2 pl-6 mt-2">
                          {res.options.map((opt, oIdx) => {
                            const cleanOpt = opt.label.replace(/[()]/g, "").trim().toUpperCase();
                            const cleanStudentAns = (res.student_answer || "").replace(/[()]/g, "").trim().toUpperCase();
                            const cleanCorrectAns = (res.correct_answer || "").replace(/[()]/g, "").trim().toUpperCase();
                            const isSelected = cleanStudentAns === cleanOpt;
                            const isCorrect = cleanCorrectAns === cleanOpt;
                            const cleanLabel = stripMarkdown(opt.label);
                            
                            let optStyle = "border-border/60 bg-card";
                            let badgeStyle = "bg-muted text-muted-foreground border-border/60";
                            
                            if (isSelected) {
                              if (res.is_correct) {
                                optStyle = "border-green-500 bg-green-50/10 dark:bg-green-950/10 text-green-700 dark:text-green-400 font-semibold";
                                badgeStyle = "bg-green-500 text-white border-green-500";
                              } else {
                                optStyle = "border-destructive bg-destructive/5 text-destructive font-semibold";
                                badgeStyle = "bg-destructive text-white border-destructive";
                              }
                            } else if (isCorrect) {
                              optStyle = "border-green-500/50 bg-green-50/5 dark:bg-green-950/5 text-green-700 dark:text-green-400";
                              badgeStyle = "bg-green-500/80 text-white border-green-500/80";
                            }

                            return (
                              <div
                                key={oIdx}
                                className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all w-full select-none ${optStyle}`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 border ${badgeStyle}`}>
                                  {cleanLabel}
                                </span>
                                <span className="flex-1 leading-normal pt-0.5">{stripMarkdown(opt.text)}</span>
                                {isSelected && res.is_correct && <Check className="h-4 w-4 text-green-500 shrink-0 self-center" />}
                                {isSelected && !res.is_correct && <X className="h-4 w-4 text-destructive shrink-0 self-center" />}
                              </div>
                            );
                          })}
                        </div>

                        {res.explanation && (
                          <div className="mt-3 ml-6 p-3 bg-muted/30 border-l-2 border-primary/40 rounded-r text-[11px] text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground/80">Explanation: </span>
                            {renderTextWithTables(res.explanation)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>

            {/* Right: Detailed Answer matrix grid */}
            <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6">
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Question Index ({testResult.correct_count}/{testResult.total_questions})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pr-1 pb-4">
                  <ScrollArea className="h-[calc(100vh-190px)] pr-3">
                    <div className="grid grid-cols-6 gap-1.5">
                      {testResult.detailed_results.map((res, idx) => {
                        const isCorrect = res.is_correct;
                        const isAnswered = Boolean(res.student_answer);
                        return (
                          <button
                            key={res.question_id || idx}
                            onClick={() => {
                              const el = document.getElementById(`review-question-${idx}`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                              }
                            }}
                            className={`h-8 rounded-md text-xs font-semibold border transition-all cursor-pointer flex flex-col items-center justify-center ${
                              isCorrect
                                ? "bg-green-500 hover:bg-green-600 text-white border-green-600"
                                : isAnswered
                                ? "bg-destructive hover:bg-destructive/90 text-white border-destructive"
                                : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/80"
                            }`}
                          >
                            <span>{idx + 1}</span>
                            <span className="text-[8px] uppercase -mt-0.5">
                              {res.student_answer || "-"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Questions & Options View */}
      {!testResult && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left: Questions Pane */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* Questions Container */}
            <div className="bg-card border border-border shadow-xs rounded-xl p-6 md:p-8">
              {questions.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
                  The selected exam does not contain any questions.
                </div>
              ) : (
                <AllQuestionsTakingView
                  questions={questions}
                  studentAnswers={studentAnswers}
                  isTestRunning={isTestRunning}
                  onSelectOption={handleSelectOption}
                />
              )}
            </div>
          </div>

          {/* Right: Answer Sheet Grid & Navigation Sidebar */}
          <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6">
            <Card className="border-border shadow-xs bg-card">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Question Index</span>
                  <span className="text-[10px] text-primary">
                    {Object.keys(studentAnswers).length}/{questions.length} Checked
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-4 space-y-4">
                {/* Timer Card */}
                {isTestRunning && (
                  <div className="p-3 bg-muted/40 rounded-xl border border-border/80 flex items-center justify-between gap-1.5 font-semibold">
                    <span className="text-xs text-muted-foreground">Time Remaining:</span>
                    <div className="flex items-center gap-1.5 text-primary">
                      <Clock className="h-4 w-4 text-primary animate-pulse" />
                      <span className="text-sm font-mono font-bold">{formatTime(timeRemaining)}</span>
                    </div>
                  </div>
                )}

                {/* Action Controls Card: Exit & Submit */}
                {isTestRunning && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("Exit test? Your progress will be saved as draft.")) {
                          setIsTestRunning(false);
                          if (onBack) onBack();
                        }
                      }}
                      className="h-8 text-xs font-semibold"
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Exit
                    </Button>
                    <Button
                      onClick={handleCompleteExam}
                      disabled={isSubmitting}
                      className="h-8 text-xs font-semibold gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> Submit
                    </Button>
                  </div>
                )}

                <ScrollArea className="h-[calc(100vh-290px)] pr-1">
                  <div className="grid grid-cols-5 gap-1.5 p-1">
                    {questions.map((q, idx) => {
                      const isAnswered = Boolean(studentAnswers[q.id]);
                      const isActive = idx === activeQuestionIdx;
                      return (
                        <Button
                          key={q.id || idx}
                          variant={isAnswered ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const el = document.getElementById(`question-${idx}`);
                            if (el) {
                              isAutoScrollingRef.current = true;
                              setActiveQuestionIdx(idx);
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              setTimeout(() => {
                                isAutoScrollingRef.current = false;
                              }, 850);
                            }
                          }}
                          className={`h-8 w-full text-xs font-semibold ${
                            isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                          }`}
                        >
                          {idx + 1}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

interface TakingViewProps {
  questions: Question[];
  studentAnswers: Record<string, string>;
  isTestRunning: boolean;
  onSelectOption: (qId: string, label: string) => void;
}

function AllQuestionsTakingView({
  questions,
  studentAnswers,
  isTestRunning,
  onSelectOption,
}: TakingViewProps) {
  const groups = groupByStimulus(questions);
  const startIndices = groups.map((_, i) =>
    groups.slice(0, i).reduce((acc, g) => acc + g.questions.length, 0)
  );

  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-2">
          {group.stimulus && <StimulusBlock text={group.stimulus} />}
          <div className="divide-y divide-border/30">
            {group.questions.map((q, qi) => (
              <QuestionInteractiveRow
                key={q.id || `${gi}-${qi}`}
                question={q}
                index={startIndices[gi] + qi}
                isTestRunning={isTestRunning}
                selectedAnswer={studentAnswers[q.id]}
                onSelectOption={onSelectOption}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}




