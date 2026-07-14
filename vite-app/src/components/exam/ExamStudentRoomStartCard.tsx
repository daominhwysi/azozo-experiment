import type { Exam } from "@/types/exam"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, FileText, Clock, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ExamStudentRoomStartCardProps {
  activeExam: Exam
  questionsLength: number
  exams: Exam[]
  onSelectExam?: (exam: Exam) => void
  handleStartTest: () => void
  onBack?: () => void
}

export function ExamStudentRoomStartCard({
  activeExam,
  questionsLength,
  exams,
  onSelectExam,
  handleStartTest,
  onBack,
}: ExamStudentRoomStartCardProps) {
  const hasMultipleExams = onSelectExam && exams.length > 1

  return (
    <div className={cn("w-full", hasMultipleExams ? "max-w-5xl mx-auto" : "max-w-xl mx-auto")}>
      <div className={cn("grid gap-6", hasMultipleExams ? "grid-cols-1 md:grid-cols-5" : "grid-cols-1")}>
        
        {/* Left column: Available Exams selection */}
        {hasMultipleExams && (
          <div className="md:col-span-2 space-y-3">
            <div className="px-1 select-none">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Available Assessments
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Select an exam paper from the catalog below to prepare.
              </p>
            </div>
            
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {exams.map((ex) => {
                const isActive = ex.id === activeExam.id
                return (
                  <div
                    key={ex.id}
                    onClick={() => onSelectExam(ex)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isActive
                        ? "border-primary bg-primary/5 font-semibold text-foreground"
                        : "border-border/60 bg-card text-foreground hover:bg-muted/40"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-muted text-muted-foreground"
                      )}
                    >
                      <FileText className="h-3 w-3" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-snug truncate text-foreground">
                        {ex.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">
                          {ex.subject}
                        </span>
                        <span className="text-[9px] text-muted-foreground/60">•</span>
                        <span className="text-[9px] font-semibold text-muted-foreground">
                          {ex.grade}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/45 transition-transform", isActive && "text-primary translate-x-0.5")} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Right/Center column: Selected Exam Details */}
        <div className={cn(hasMultipleExams ? "md:col-span-3" : "w-full")}>
          <Card className="rounded-xl border border-border bg-card shadow-none">
            <CardHeader className="pb-2 text-center border-b border-border/40 bg-muted/10 py-5">
              <div className="mb-2.5 text-3xl select-none">📝</div>
              <CardTitle className="text-sm font-bold text-foreground">
                {activeExam.title}
              </CardTitle>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-semibold">
                  {activeExam.subject}
                </Badge>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold">
                  {activeExam.grade}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4 p-5 text-xs leading-relaxed text-muted-foreground">
              {/* Stats Box */}
              <div className="grid grid-cols-2 gap-3.5 rounded-lg border border-border/60 bg-muted/20 p-3 select-none">
                <div className="flex flex-col items-center justify-center p-1 border-r border-border/40">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Duration
                  </span>
                  <span className="mt-1 font-mono text-sm font-bold text-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {activeExam.duration_minutes || 45} mins
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Questions
                  </span>
                  <span className="mt-1 font-mono text-sm font-bold text-foreground flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    {questionsLength} questions
                  </span>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <h3 className="font-bold text-foreground uppercase tracking-wider text-[10px]">
                  Exam Instructions:
                </h3>
                <ul className="list-disc space-y-1.5 pl-4 text-foreground/80 leading-normal">
                  <li>Click the <strong className="text-foreground">"Start Exam"</strong> button below to begin.</li>
                  <li>Use the question selector and navigation bar to navigate between items.</li>
                  <li>Answers are saved automatically as you make choices.</li>
                  <li>Once completed, click <strong className="text-foreground">"Submit"</strong> to finish and receive your score report.</li>
                </ul>
              </div>

              {/* CTA Buttons */}
              <div className="flex gap-2 pt-2">
                {onBack && (
                  <Button
                    variant="outline"
                    onClick={onBack}
                    className="h-10 px-4 cursor-pointer text-xs font-semibold border-border hover:bg-muted/40"
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={handleStartTest}
                  className="h-10 flex-1 cursor-pointer gap-1.5 rounded-lg border-0 bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="h-3.5 w-3.5" /> Start Exam
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
