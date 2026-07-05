import type { Exam } from "@/types/exam";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Clock, Info } from "lucide-react";

interface ExamViewerProps {
  exam: Exam | null;
}

export function ExamViewer({ exam }: ExamViewerProps) {
  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
        <Info className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">Chưa chọn đề thi nào. Vui lòng chọn một đề từ ngân hàng.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Exam Overview Banner */}
      <div className="border border-border rounded-xl p-6 bg-card space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{exam.subject}</Badge>
          <Badge variant="secondary">{exam.grade}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {exam.duration_minutes} phút
          </span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{exam.title}</h1>
        <p className="text-xs text-muted-foreground">
          Tổng số câu hỏi: <span className="font-semibold text-foreground">{exam.questions.length} câu</span>
        </p>
      </div>

      {/* Questions list */}
      <div className="space-y-4">
        {exam.questions.map((q, idx) => (
          <Card key={q.id || idx} className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-2">
                <Badge variant="default" className="mt-0.5 text-xs">
                  {q.question_number || `Câu ${idx + 1}`}
                </Badge>
                <CardTitle className="text-sm font-medium leading-relaxed">
                  {q.stem}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {q.options.map((opt, oIdx) => {
                  const isCorrect = opt.label.toUpperCase() === (q.correct_answer || "").toUpperCase();
                  return (
                    <div
                      key={oIdx}
                      className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                        isCorrect
                          ? "border-primary/60 bg-primary/10 font-medium text-foreground"
                          : "border-border/80 bg-card text-foreground"
                      }`}
                    >
                      <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] min-w-[22px] text-center border ${
                        isCorrect
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border/60"
                      }`}>
                        {opt.label}.
                      </span>
                      <span className="flex-1 leading-relaxed pt-0.5">{opt.text}</span>
                    </div>
                  );
                })}
              </div>


              {q.explanation && (
                <div className="mt-3 p-3 bg-muted/40 rounded-lg text-xs border border-border/40 text-muted-foreground">
                  <span className="font-semibold text-foreground">Lời giải chi tiết: </span>
                  {q.explanation}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
