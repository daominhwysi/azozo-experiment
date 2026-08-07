import { useEffect, useRef } from "react"
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
  const panelRef = useRef<HTMLDivElement>(null)

  // Restore focus to whatever opened the map, and let Escape dismiss it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Question map, ${questions.length} questions`}
      tabIndex={-1}
      className="fixed bottom-24 left-6 z-50 flex w-80 flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-md outline-none md:w-96"
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-xs font-bold text-foreground">
          Question Map ({questions.length} questions)
        </span>
        <button
          onClick={onClose}
          aria-label="Close question map"
          className="cursor-pointer rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`Question ${idx + 1}: ${
                        isCorrect
                          ? "correct"
                          : isAnswered
                            ? "incorrect"
                            : "not answered"
                      }`}
                      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-xs font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        isCorrect
                          ? "border-success bg-success text-success-foreground hover:bg-success/90"
                          : isAnswered
                            ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`Question ${idx + 1}: ${
                      isAnswered ? "answered" : "not answered"
                    }`}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-xs font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
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
