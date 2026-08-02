import { useEffect, useRef, useState } from "react"
import type { Exam, TestResult, Question } from "@/types/exam"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, RefreshCw, ArrowLeft, Copy } from "lucide-react"
import { getSectionTitle } from "@/lib/markdown"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ExamStudentRoomHeaderProps {
  onBack?: () => void
  activeExam: Exam
  isTestRunning: boolean
  setIsTestRunning: (running: boolean) => void
  testResult: TestResult | null
  viewMode: "full" | "single"
  setViewMode: (mode: "full" | "single") => void
  activeQuestionIdx: number
  questions: Question[]
  timeRemaining: number
  isSubmitting: boolean
  handleCompleteExam: () => void
  handleStartTest: () => void
  handleCopyAnswerSheet: () => void
  choiceStyle: "radio" | "abcd"
  setChoiceStyle: (style: "radio" | "abcd") => void
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/** Spoken form of the countdown — "05:00" reads as "five hundred" otherwise. */
function spokenTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  const parts = []
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`)
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? "" : "s"}`)
  return `${parts.join(" ")} remaining`
}

/** Announce only at milestones — a per-second live region would be unusable. */
const WARN_AT = [600, 300, 60, 30]

function useTimeWarning(timeRemaining: number, active: boolean) {
  const [warning, setWarning] = useState("")
  const announced = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!active) {
      announced.current.clear()
      setWarning("")
      return
    }
    const hit = WARN_AT.find(
      (t) => timeRemaining <= t && !announced.current.has(t)
    )
    if (hit !== undefined) {
      announced.current.add(hit)
      setWarning(spokenTime(timeRemaining))
    }
  }, [timeRemaining, active])

  return warning
}

export function ExamStudentRoomHeader({
  onBack,
  activeExam,
  isTestRunning,
  setIsTestRunning,
  testResult,
  viewMode,
  setViewMode,
  activeQuestionIdx,
  questions,
  timeRemaining,
  isSubmitting,
  handleCompleteExam,
  handleStartTest,
  handleCopyAnswerSheet,
  choiceStyle,
  setChoiceStyle,
}: ExamStudentRoomHeaderProps) {
  const timeWarning = useTimeWarning(timeRemaining, isTestRunning && !testResult)

  return (
    <header className="sticky top-0 z-40 flex w-full items-center justify-between border-b border-border bg-background px-6 py-1.5 select-none">
      {/* Left Side */}
      <div className="flex min-w-0 items-center gap-4">
        {onBack && (
          <button
            onClick={() => {
              if (isTestRunning) {
                if (
                  confirm("Exit test? Your progress will be saved as draft.")
                ) {
                  setIsTestRunning(false)
                  onBack()
                }
              } else {
                onBack()
              }
            }}
            aria-label={isTestRunning ? "Exit test" : "Back"}
            className="flex h-9 w-9 sm:h-8 sm:w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </button>
        )}

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <span className="text-xl font-black tracking-tighter text-primary">
            AZOZO
          </span>
          <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">
            Exam
          </span>
        </div>

        <div className="hidden h-5 w-px shrink-0 bg-border/80 md:block" />

        <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
          {!isTestRunning && (
            <>
              <span className="shrink-0 text-xs font-extrabold text-foreground select-none md:text-sm">
                {testResult ? "Results" : "Prepare"}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">•</span>
            </>
          )}
          <span className="max-w-[80px] sm:max-w-[150px] md:max-w-[250px] truncate text-xs font-semibold text-muted-foreground">
            {activeExam.title}
          </span>
          {isTestRunning && !testResult && questions[activeQuestionIdx] && (
            <>
              {getSectionTitle(questions[activeQuestionIdx]?.section, 0) !== "Section 0" && (
                <>
                  <span className="hidden shrink-0 text-xs font-medium text-muted-foreground md:inline">•</span>
                  <span className="shrink-0 rounded border border-primary/10 bg-primary/5 px-1.5 py-0.5 text-xs font-bold text-primary select-none">
                    {getSectionTitle(questions[activeQuestionIdx]?.section, 0)}
                  </span>
                </>
              )}
              <span className="hidden shrink-0 text-xs font-medium text-muted-foreground md:inline">•</span>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground select-none">
                Q{activeQuestionIdx + 1}/{questions.length}
              </span>
            </>
          )}
          {testResult && viewMode === "single" && testResult.detailed_results[activeQuestionIdx] && (
            <>
              <span className="hidden shrink-0 text-xs font-medium text-muted-foreground md:inline">•</span>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground select-none">
                Q{activeQuestionIdx + 1}/{testResult.detailed_results.length}
              </span>
              <span className="hidden shrink-0 text-xs font-medium text-muted-foreground md:inline">•</span>
              <Badge
                variant={testResult.detailed_results[activeQuestionIdx].is_correct ? "default" : "destructive"}
                className="shrink-0 border border-border/10 py-0.5 text-xs font-semibold select-none"
              >
                {testResult.detailed_results[activeQuestionIdx].is_correct ? "Correct" : "Incorrect"}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Right Side */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {isTestRunning ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Select
              value={viewMode}
              onValueChange={(val) => setViewMode(val as "full" | "single")}
            >
              <SelectTrigger className="text-xs w-28 sm:w-32 bg-background dark:bg-card text-foreground">
                <SelectValue placeholder="View mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">All Questions</SelectItem>
                <SelectItem value="single">One by One</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={choiceStyle}
              onValueChange={(val) => setChoiceStyle(val as "radio" | "abcd")}
            >
              <SelectTrigger className="text-xs w-20 sm:w-24 bg-background dark:bg-card text-foreground">
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="radio">Radio</SelectItem>
                <SelectItem value="abcd">ABCD</SelectItem>
              </SelectContent>
            </Select>

            <div
              role="timer"
              aria-label={spokenTime(timeRemaining)}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-1 sm:px-3 sm:py-1.5"
            >
              <Clock
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-pulse text-primary sm:h-4 sm:w-4"
              />
              <span className="font-mono text-xs font-bold text-primary sm:text-sm">
                {formatTime(timeRemaining)}
              </span>
            </div>
            {/* Milestone-only announcements (10m / 5m / 1m / 30s). */}
            <span role="status" aria-live="polite" className="sr-only">
              {timeWarning}
            </span>
            <Button
              onClick={handleCompleteExam}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              size="sm"
              className="h-9 sm:h-8 gap-1 rounded-lg border-0 bg-primary px-2.5 sm:px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              {isSubmitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        ) : testResult ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Select
              value={choiceStyle}
              onValueChange={(val) => setChoiceStyle(val as "radio" | "abcd")}
            >
              <SelectTrigger className="text-xs w-20 sm:w-24 bg-background dark:bg-card text-foreground">
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="radio">Radio</SelectItem>
                <SelectItem value="abcd">ABCD</SelectItem>
              </SelectContent>
            </Select>

            <div className="rounded-full border border-success/20 bg-success/10 px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-bold text-success">
              Score: {testResult.score} <span className="hidden sm:inline">/ 10</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                onClick={handleCopyAnswerSheet}
                variant="outline"
                className="h-8 gap-1.5 px-2 sm:px-3 text-xs"
                title="Copy Results"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copy Results</span>
              </Button>
              <Button
                onClick={handleStartTest}
                variant="outline"
                className="h-8 gap-1.5 px-2 sm:px-3 text-xs"
                title="Retake Exam"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Retake Exam</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{activeExam.duration_minutes || 45}<span className="hidden sm:inline"> minutes</span><span className="inline sm:hidden">m</span></span>
          </div>
        )}
      </div>
    </header>
  )
}
