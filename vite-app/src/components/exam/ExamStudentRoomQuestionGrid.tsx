import type { TestResult } from "@/types/exam"
import { X } from "lucide-react"
import type { SectionGroup } from "@/lib/markdown"

interface ExamStudentRoomQuestionGridProps {
  testResult: TestResult | null
  questions: { id: string }[]
  sectionGroups: SectionGroup[]
  activeQuestionIdx: number
  studentAnswers: Record<string, string>
  onClose: () => void
  onSelectQuestion: (idx: number) => void
}

export function ExamStudentRoomQuestionGrid({
  testResult,
  questions,
  sectionGroups,
  activeQuestionIdx,
  studentAnswers,
  onClose,
  onSelectQuestion,
}: ExamStudentRoomQuestionGridProps) {
  return (
    <div className="fixed bottom-24 left-6 z-50 flex w-80 flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-xl md:w-96">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-xs font-bold text-foreground">
          Question Map ({questions.length} questions)
        </span>
        <button
          onClick={onClose}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-60 scrollbar-none overflow-y-auto pr-1">
        {sectionGroups.map((group, gIdx) => (
          <div key={gIdx} className="mb-4 space-y-2 last:mb-0">
            <div className="text-xs font-medium text-muted-foreground">
              {group.sectionTitle}
            </div>
            <div className="grid grid-cols-6 gap-1.5 md:grid-cols-8">
              {group.questions.map(({ question: q, globalIndex: idx }) => {
                if (testResult) {
                  const res = testResult.detailed_results[idx]
                  if (!res) return null
                  const isCorrect = res.is_correct
                  const isAnswered = Boolean(res.student_answer)
                  const isActive = idx === activeQuestionIdx
                  return (
                    <button
                      key={q.id || idx}
                      onClick={() => { onSelectQuestion(idx); onClose() }}
                      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-xs font-bold transition-all ${
                        isCorrect
                          ? "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-600"
                          : isAnswered
                            ? "border-destructive bg-destructive text-white hover:bg-destructive/90"
                            : "border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted"
                      } ${isActive ? "scale-105 border-2 border-foreground font-bold" : ""}`}
                    >
                      {idx + 1}
                    </button>
                  )
                }
                const isAnswered = Boolean(studentAnswers[q.id])
                const isActive = idx === activeQuestionIdx
                return (
                  <button
                    key={q.id || idx}
                    onClick={() => { onSelectQuestion(idx); onClose() }}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-xs font-bold transition-all ${
                      isActive
                        ? "scale-105 border-primary bg-primary font-bold text-primary-foreground"
                        : isAnswered
                          ? "border-border/80 bg-secondary font-semibold text-secondary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
