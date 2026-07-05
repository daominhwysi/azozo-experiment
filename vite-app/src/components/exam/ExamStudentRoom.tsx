import { useState, useEffect, useMemo } from "react";
import type { Exam, Question, TestResult } from "@/types/exam";
import { submitExam } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Check, RefreshCw, Play } from "lucide-react";

interface ExamStudentRoomProps {
  exams: Exam[];
  selectedExam: Exam | null;
  onSelectExam?: (exam: Exam) => void;
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
        <div key={`table-${key}`} className="overflow-x-auto my-3 border border-border/80 rounded-lg">
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
        <span key={`text-${key}`} className="whitespace-pre-wrap block">
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
      elements.push(<hr key={`divider-${i}`} className="my-4 border-t border-border/80" />);
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

  return <>{elements}</>;
}

function StimulusBlock({ text }: { text: string }) {
  return (
    <div className="p-4 my-4 bg-muted/30 border-l-3 border-primary/40 rounded-r-lg text-xs md:text-sm text-foreground/80 leading-relaxed font-mono">
      {renderTextWithTables(text)}
    </div>
  );
}

function QuestionInteractiveRow({
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
          {qNum || `Câu ${index + 1}:`}
        </span>
        <div className="text-xs md:text-sm font-medium text-foreground leading-relaxed flex-1">
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="space-y-2 pl-6 mt-2">
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
}

export function ExamStudentRoom({
  exams,
  selectedExam,
  onSelectExam,
}: ExamStudentRoomProps) {
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [studentName, setStudentName] = useState("Nguyễn Văn A");
  const [timeRemaining, setTimeRemaining] = useState<number>(45 * 60);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(0);

  const activeExam = selectedExam || (exams.length > 0 ? exams[0] : null);

  // Deduplicate questions by ID to fix potential backend OCR duplications
  const questions = useMemo(() => {
    const rawQuestions = activeExam?.questions || [];
    return Array.from(new Map(rawQuestions.map((q) => [q.id, q])).values());
  }, [activeExam]);

  // Scroll spy to highlight active question in map on scroll
  useEffect(() => {
    if (questions.length === 0 || testResult) return;

    const scrollContainer = document.querySelector("main");
    const observer = new IntersectionObserver(
      (entries) => {
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

  const handleSelectOption = (qId: string, label: string) => {
    if (!isTestRunning) return;
    setStudentAnswers((prev) => ({
      ...prev,
      [qId]: label,
    }));
  };

  const handleCompleteExam = async () => {
    if (!activeExam || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await submitExam(activeExam.id, studentName, studentAnswers);
      setTestResult(res);
      setIsTestRunning(false);
    } catch (e) {
      console.error(e);
      alert("Đã xảy ra lỗi khi nộp bài!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!activeExam) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs">
        Chưa có đề thi trong hệ thống.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Controls Header */}
      <div className="border border-border rounded-xl p-4 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{activeExam.subject}</Badge>
            <Badge variant="secondary">{activeExam.grade}</Badge>
          </div>
          <h1 className="text-base font-bold text-foreground">{activeExam.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-border px-3 py-1.5 rounded-lg bg-muted/30">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-mono font-bold">
              {formatTime(timeRemaining)}
            </span>
          </div>

          {!isTestRunning && !testResult && (
            <div className="flex items-center gap-2">
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
                <Play className="h-3.5 w-3.5" /> Bắt Đầu Làm Bài
              </Button>
            </div>
          )}
          {isTestRunning && (
            <Button
              onClick={handleCompleteExam}
              disabled={isSubmitting}
              variant="default"
              className="gap-1.5 text-xs"
            >
              <Check className="h-3.5 w-3.5" /> Nộp Bài
            </Button>
          )}

          {testResult && (
            <Button onClick={handleStartTest} variant="outline" className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Làm Lại Đề Thi
            </Button>
          )}
        </div>
      </div>

      {/* Test Results Summary View */}
      {testResult && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-primary">
              🎉 Kết Quả Bài Thi Trực Tuyến
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg border border-border bg-background text-center">
                <p className="text-muted-foreground text-[10px]">Điểm số</p>
                <p className="text-2xl font-bold text-primary">{testResult.score} / 10</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-background text-center">
                <p className="text-muted-foreground text-[10px]">Số câu đúng</p>
                <p className="text-2xl font-bold text-foreground">
                  {testResult.correct_count} / {testResult.total_questions}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-background text-center">
                <p className="text-muted-foreground text-[10px]">Tỷ lệ chính xác</p>
                <p className="text-2xl font-bold text-foreground">{testResult.percentage}%</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-background text-center">
                <p className="text-muted-foreground text-[10px]">Học sinh</p>
                <p className="text-base font-semibold text-foreground mt-1">
                  {testResult.student_name}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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
                  Đề thi không có câu hỏi nào.
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
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Ma Trận Trả Lời ({Object.keys(studentAnswers).length}/{questions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pr-1 pb-4">
                <ScrollArea className="h-[calc(100vh-190px)] pr-3">
                  <div className="grid grid-cols-6 gap-1.5">
                    {questions.map((q, idx) => {
                      const isAnswered = Boolean(studentAnswers[q.id]);
                      const isActive = idx === activeQuestionIdx;
                      return (
                        <button
                          key={q.id || idx}
                          onClick={() => {
                            const el = document.getElementById(`question-${idx}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              setActiveQuestionIdx(idx);
                            }
                          }}
                          className={`h-8 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                            isActive
                              ? "ring-2 ring-primary border-primary"
                              : ""
                          } ${
                            isAnswered
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/30 text-foreground hover:bg-muted border-border/80"
                          }`}
                        >
                          {idx + 1}
                        </button>
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




