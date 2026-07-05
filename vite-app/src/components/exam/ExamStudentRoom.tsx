import { useState, useEffect } from "react";
import type { Exam, TestResult } from "@/types/exam";
import { submitExam } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Check, RefreshCw, Play } from "lucide-react";

interface ExamStudentRoomProps {
  exams: Exam[];
  selectedExam: Exam | null;
  onSelectExam?: (exam: Exam) => void;
}

export function ExamStudentRoom({
  exams,
  selectedExam,
  onSelectExam,
}: ExamStudentRoomProps) {


  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [studentName, setStudentName] = useState("Nguyễn Văn A");
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(45 * 60);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeExam = selectedExam || (exams.length > 0 ? exams[0] : null);

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

  // Active question details
  const questions = activeExam.questions || [];
  const currentQ = questions[activeQuestionIdx];

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Active Question Display */}
          <div className="lg:col-span-8 space-y-4">

          {currentQ ? (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="text-xs">
                    {currentQ.question_number || `Câu ${activeQuestionIdx + 1}`}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Câu {activeQuestionIdx + 1} / {questions.length}
                  </span>
                </div>
                <CardTitle className="text-sm font-medium leading-relaxed mt-2 text-foreground">
                  {currentQ.stem}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {currentQ.options.map((opt, oIdx) => {
                  const isSelected = studentAnswers[currentQ.id] === opt.label;
                  return (
                    <button
                      key={oIdx}
                      disabled={!isTestRunning}
                      onClick={() => handleSelectOption(currentQ.id, opt.label)}
                      className={`w-full text-left p-3 rounded-xl border text-xs flex items-start gap-3 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground font-semibold ring-1 ring-ring shadow-xs"
                          : "border-border bg-card hover:bg-accent/40 text-foreground"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}>
                        {opt.label}
                      </span>
                      <span className="flex-1 mt-0.5 leading-relaxed text-foreground font-medium">{opt.text}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
              Đề thi không có câu hỏi nào.
            </div>
          )}
        </div>

        {/* Right: Answer Sheet Grid & Navigation */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ma Trận Trả Lời ({Object.keys(studentAnswers).length}/{questions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = Boolean(studentAnswers[q.id]);
                  const isActive = idx === activeQuestionIdx;
                  return (
                    <button
                      key={q.id || idx}
                      onClick={() => setActiveQuestionIdx(idx)}
                      className={`h-9 rounded-lg text-xs font-semibold border transition-all ${
                        isActive
                          ? "ring-2 ring-primary border-primary"
                          : ""
                      } ${
                        isAnswered
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/30 text-foreground hover:bg-muted"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Student Name Input */}
              <div className="mt-6 space-y-1.5 border-t pt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  Họ và tên thí sinh:
                </label>
                <Input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  disabled={isTestRunning}
                  className="h-8 text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}



