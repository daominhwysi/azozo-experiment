import { useRef } from "react"
import type { Question, TestResult } from "@/types/exam"
import { Button } from "@/components/ui/button"
import type { SectionGroup } from "@/lib/markdown"

interface ExamStudentRoomBottomBarProps {
  testResult: TestResult | null
  isTestRunning: boolean
  isSingleMode: boolean
  questions: Question[]
  sectionGroups: SectionGroup[]
  hasSections: boolean
  activeSectionIdx: number
  activeQuestionIdx: number
  studentAnswers: Record<string, string>
  viewMode: "full" | "single"
  showQuestionNumbers: boolean
  showQuestionGrid: boolean
  setShowQuestionGrid: (show: boolean) => void
  setShowQuestionNumbers: (show: boolean) => void
  setActiveQuestionIdx: (idx: number) => void
  setActiveSectionIdx: (idx: number) => void
  onBack?: () => void
}

export function ExamStudentRoomBottomBar({
  testResult,
  isTestRunning,
  isSingleMode,
  questions,
  sectionGroups,
  hasSections,
  activeSectionIdx,
  activeQuestionIdx,
  studentAnswers,
  viewMode,
  showQuestionNumbers,
  showQuestionGrid,
  setShowQuestionGrid,
  setShowQuestionNumbers,
  setActiveQuestionIdx,
  setActiveSectionIdx,
  onBack,
}: ExamStudentRoomBottomBarProps) {
  const isAutoScrollingRef = useRef(false)

  function handleSectionTabClick(secIdx: number) {
    setActiveSectionIdx(secIdx)
    const firstQInSec = sectionGroups[secIdx]?.questions[0]
    if (firstQInSec) {
      setActiveQuestionIdx(firstQInSec.globalIndex)
      if (viewMode === "full") {
        const prefix = testResult ? "review-question-" : "question-"
        const el = document.getElementById(prefix + firstQInSec.globalIndex)
        if (el) {
          isAutoScrollingRef.current = true
          el.scrollIntoView({ behavior: "auto", block: "center" })
          setTimeout(() => {
            isAutoScrollingRef.current = false
          }, 850)
        }
      }
    }
  }

  return (
    <>
      {/* Taking Bottom Bar */}
      {!testResult && isTestRunning && (
        <div
          className={
            isSingleMode
              ? "flex shrink-0 flex-col gap-2.5 border-t border-border bg-background px-4 py-2.5 md:px-6"
              : "fixed right-0 bottom-0 left-0 z-50 flex flex-col gap-2.5 border-t border-border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-md md:px-6"
          }
        >
          {showQuestionNumbers && (
            <div className="mx-auto flex w-full max-w-7xl justify-start overflow-hidden border-b border-border/30 pb-2 px-4 md:px-6">
              <div className="flex w-full scrollbar-none items-center gap-1.5 overflow-x-auto py-0.5">
                {sectionGroups[activeSectionIdx]?.questions.map(
                  ({ question: q, globalIndex: idx }) => {
                    const isAnswered = Boolean(studentAnswers[q.id])
                    const isActive = idx === activeQuestionIdx
                    return (
                      <Button
                        key={q.id || idx}
                        id={`nav-question-${idx}`}
                        variant={isActive ? "default" : isAnswered ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => {
                          setActiveQuestionIdx(idx)
                          if (viewMode === "full") {
                            const el = document.getElementById(`question-${idx}`)
                            if (el) {
                              isAutoScrollingRef.current = true
                              el.scrollIntoView({ behavior: "auto", block: "center" })
                              setTimeout(() => { isAutoScrollingRef.current = false }, 850)
                            }
                          }
                        }}
                        className="h-8 w-8 shrink-0 rounded-md p-0 text-xs font-semibold transition-all"
                      >
                        {idx + 1}
                      </Button>
                    )
                  }
                )}
              </div>
            </div>
          )}

          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowQuestionGrid(!showQuestionGrid)}
                  className={`h-7 w-7 rounded-md transition-colors ${
                    showQuestionGrid
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="grid h-3.5 w-3.5 grid-cols-3 gap-0.5">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span key={i} className="rounded-xs bg-current" />
                    ))}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowQuestionNumbers(!showQuestionNumbers)}
                  className={`h-7 w-7 rounded-md transition-colors ${
                    showQuestionNumbers
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={showQuestionNumbers ? "Hide question list" : "Show question list"}
                >
                  <span className="flex h-3.5 w-3.5 flex-col items-center justify-center gap-0.5">
                    <span className="h-0.5 w-3.5 rounded-xs bg-current" />
                    <span className="h-0.5 w-2 rounded-xs bg-current" />
                  </span>
                </Button>
              </div>
              <div className="hidden text-left md:block">
                <div className="text-xs font-medium text-muted-foreground">
                  {sectionGroups[activeSectionIdx]?.sectionTitle || "Questions"}
                </div>
                <div className="text-xs font-semibold text-foreground mt-0.5">
                  Checked{" "}
                  {sectionGroups[activeSectionIdx]?.questions.filter(
                    (g) => studentAnswers[g.question.id]
                  ).length || 0}{" "}
                  / {sectionGroups[activeSectionIdx]?.questions.length || 0}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 scrollbar-none overflow-x-auto px-2 py-1">
              {hasSections && (
                <div className="flex items-center justify-center gap-2">
                  {sectionGroups.map((group, idx) => {
                    const isCurrent = idx === activeSectionIdx
                    const answeredCount = group.questions.filter(
                      (g) => studentAnswers[g.question.id]
                    ).length
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSectionTabClick(idx)}
                        className={`shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                          isCurrent
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {group.sectionTitle}{" "}
                        <span className="ml-1 font-mono text-xs opacity-60">
                          ({answeredCount}/{group.questions.length})
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeQuestionIdx > 0) {
                    const nextIdx = activeQuestionIdx - 1
                    setActiveQuestionIdx(nextIdx)
                    if (viewMode === "full") {
                      const el = document.getElementById(`question-${nextIdx}`)
                      if (el) {
                        isAutoScrollingRef.current = true
                        el.scrollIntoView({ behavior: "auto", block: "center" })
                        setTimeout(() => { isAutoScrollingRef.current = false }, 850)
                      }
                    }
                  }
                }}
                disabled={activeQuestionIdx === 0}
                className="h-8 w-8 p-0 lg:h-8 lg:w-auto lg:px-3 lg:gap-1.5"
              >
                <span className="lg:hidden">&larr;</span>
                <span className="hidden lg:inline">&larr; Previous Question</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeQuestionIdx < questions.length - 1) {
                    const nextIdx = activeQuestionIdx + 1
                    setActiveQuestionIdx(nextIdx)
                    if (viewMode === "full") {
                      const el = document.getElementById(`question-${nextIdx}`)
                      if (el) {
                        isAutoScrollingRef.current = true
                        el.scrollIntoView({ behavior: "auto", block: "center" })
                        setTimeout(() => { isAutoScrollingRef.current = false }, 850)
                      }
                    }
                  }
                }}
                disabled={activeQuestionIdx === questions.length - 1}
                className="h-8 w-8 p-0 lg:h-8 lg:w-auto lg:px-3 lg:gap-1.5"
              >
                <span className="lg:hidden">&rarr;</span>
                <span className="hidden lg:inline">Next Question &rarr;</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results Bottom Bar */}
      {testResult && (
        <div
          className={
            isSingleMode
              ? "flex shrink-0 flex-col gap-2.5 border-t border-border bg-background px-4 py-2.5 md:px-6"
              : "fixed right-0 bottom-0 left-0 z-50 flex flex-col gap-2.5 border-t border-border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-md md:px-6"
          }
        >
          {showQuestionNumbers && (
            <div className="mx-auto flex w-full max-w-7xl justify-start overflow-hidden border-b border-border/30 pb-2 px-4 md:px-6">
              <div className="flex w-full scrollbar-none items-center gap-1.5 overflow-x-auto py-0.5">
                {sectionGroups[activeSectionIdx]?.questions.map(
                  ({ globalIndex: idx }) => {
                    const res = testResult.detailed_results[idx]
                    if (!res) return null
                    const isCorrect = res.is_correct
                    const isAnswered = Boolean(res.student_answer)
                    const isActive = idx === activeQuestionIdx
                    return (
                      <button
                        key={res.question_id || idx}
                        id={`nav-question-${idx}`}
                        onClick={() => {
                          setActiveQuestionIdx(idx)
                          if (viewMode === "full") {
                            const el = document.getElementById(`review-question-${idx}`)
                            if (el) el.scrollIntoView({ behavior: "auto", block: "center" })
                          }
                        }}
                        className={`flex h-8 w-8 shrink-0 cursor-pointer flex-col items-center justify-center rounded-md border text-xs font-semibold transition-all ${
                          isCorrect
                            ? "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-600"
                            : isAnswered
                              ? "border-destructive bg-destructive text-white hover:bg-destructive/90"
                              : "border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted"
                        } ${isActive ? "scale-105 border-2 border-foreground font-bold" : ""}`}
                      >
                        <span>{idx + 1}</span>
                      </button>
                    )
                  }
                )}
              </div>
            </div>
          )}

          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowQuestionGrid(!showQuestionGrid)}
                  className={`h-7 w-7 rounded-md transition-colors ${
                    showQuestionGrid
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="grid h-3.5 w-3.5 grid-cols-3 gap-0.5">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span key={i} className="rounded-xs bg-current" />
                    ))}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowQuestionNumbers(!showQuestionNumbers)}
                  className={`h-7 w-7 rounded-md transition-colors ${
                    showQuestionNumbers
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={showQuestionNumbers ? "Hide question list" : "Show question list"}
                >
                  <span className="flex h-3.5 w-3.5 flex-col items-center justify-center gap-0.5">
                    <span className="h-0.5 w-3.5 rounded-xs bg-current" />
                    <span className="h-0.5 w-2 rounded-xs bg-current" />
                  </span>
                </Button>
              </div>
              <div className="h-8 w-px bg-border/80" />
              <div className="text-left">
                <div className="text-xs font-medium text-muted-foreground">
                  Correct Rate
                </div>
                <div className="text-xs font-bold text-primary mt-0.5">
                  {testResult.correct_count} / {testResult.total_questions} ({testResult.percentage}%)
                </div>
              </div>
              <div className="h-8 w-px bg-border/80" />
              <div className="text-left">
                <div className="text-xs font-medium text-muted-foreground">
                  Score
                </div>
                <div className="text-xs font-bold text-foreground mt-0.5">
                  {testResult.score} / 10
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 scrollbar-none overflow-x-auto px-2 py-1">
              {hasSections && (
                <div className="flex items-center justify-center gap-2">
                  {sectionGroups.map((group, idx) => {
                    const isCurrent = idx === activeSectionIdx
                    const correctCount = group.questions.filter(
                      (g) => testResult.detailed_results[g.globalIndex]?.is_correct
                    ).length
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSectionTabClick(idx)}
                        className={`shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                          isCurrent
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {group.sectionTitle}{" "}
                        <span className="ml-1 font-mono text-xs opacity-60">
                          ({correctCount}/{group.questions.length})
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeQuestionIdx > 0) {
                    const nextIdx = activeQuestionIdx - 1
                    setActiveQuestionIdx(nextIdx)
                    if (viewMode === "full") {
                      const el = document.getElementById(`review-question-${nextIdx}`)
                      if (el) {
                        el.scrollIntoView({ behavior: "auto", block: "center" })
                      }
                    }
                  }
                }}
                disabled={activeQuestionIdx === 0}
                className="h-8 w-8 p-0 lg:h-8 lg:w-auto lg:px-3 lg:gap-1.5"
              >
                <span className="lg:hidden">&larr;</span>
                <span className="hidden lg:inline">&larr; Previous Question</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeQuestionIdx < testResult.detailed_results.length - 1) {
                    const nextIdx = activeQuestionIdx + 1
                    setActiveQuestionIdx(nextIdx)
                    if (viewMode === "full") {
                      const el = document.getElementById(`review-question-${nextIdx}`)
                      if (el) {
                        el.scrollIntoView({ behavior: "auto", block: "center" })
                      }
                    }
                  }
                }}
                disabled={activeQuestionIdx === testResult.detailed_results.length - 1}
                className="h-8 w-8 p-0 lg:h-8 lg:w-auto lg:px-3 lg:gap-1.5"
              >
                <span className="lg:hidden">&rarr;</span>
                <span className="hidden lg:inline">Next Question &rarr;</span>
              </Button>
              {onBack && (
                <Button variant="outline" size="sm" onClick={onBack} className="h-8 px-4 text-xs font-semibold">
                  Back
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
