import { useState, useMemo } from "react"
import type { TestResult } from "@/types/exam"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { StimulusBlock } from "./StimulusBlock"
import { renderTextWithTables, stripMarkdown } from "@/lib/markdown"
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  BookOpen,
  User,
  Calendar,
  Layers,
  SlidersHorizontal,
  Check,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AssessmentReviewProps {
  result: TestResult
  onBack: () => void
  choiceStyle: "radio" | "abcd"
}

type FilterType = "all" | "correct" | "incorrect" | "empty"

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All Questions",
  correct: "Correct",
  incorrect: "Incorrect",
  empty: "Unanswered",
}

export function AssessmentReview({ result, onBack, choiceStyle }: AssessmentReviewProps) {
  const [filter, setFilter] = useState<FilterType>("all")
  const [showSolutions, setShowSolutions] = useState(true)
  const [showRightAnswers, setShowRightAnswers] = useState(true)

  // Filter detailed results based on correct/incorrect/empty selection
  const filteredResults = useMemo(() => {
    return result.detailed_results.filter((res) => {
      if (filter === "correct") return res.is_correct
      if (filter === "incorrect") return !res.is_correct && Boolean(res.student_answer && res.student_answer.trim() !== "")
      if (filter === "empty") return !res.student_answer || res.student_answer.trim() === ""
      return true
    })
  }, [result.detailed_results, filter])

  // Count values for badges
  const counts = useMemo(() => {
    const total = result.detailed_results.length
    const correct = result.detailed_results.filter((r) => r.is_correct).length
    const empty = result.detailed_results.filter((r) => !r.student_answer || r.student_answer.trim() === "").length
    const incorrect = result.detailed_results.filter((r) => !r.is_correct && Boolean(r.student_answer && r.student_answer.trim() !== "")).length
    return { total, correct, incorrect, empty }
  }, [result.detailed_results])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header and Back Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 h-9 sm:h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
            {result.exam_title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <strong>{result.student_name}</strong> ({result.student_code})
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(result.submitted_at).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Analytics Score Banner Card */}
      <div className="grid grid-cols-2 gap-4 py-4 md:grid-cols-4 select-none border-b border-border/50">
        <div className="border-r border-border/40 p-2 text-center last:border-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Score
          </p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {result.score.toFixed(2)}
            <span className="text-xs font-normal text-muted-foreground"> / 10.0</span>
          </p>
        </div>
        <div className="border-r border-border/40 p-2 text-center md:border-r last:border-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Percentage
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {result.percentage}%
          </p>
        </div>
        <div className="border-r border-border/40 p-2 text-center last:border-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Accuracy
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {result.correct_count} / {result.total_questions}
          </p>
        </div>
        <div className="p-2 text-center last:border-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Result
          </p>
          <Badge
            variant={result.score >= 5.0 ? "default" : "destructive"}
            className="px-3 py-0.5 text-xs font-bold"
          >
            {result.score >= 5.0 ? "PASS" : "FAIL"}
          </Badge>
        </div>
      </div>

      {/* Filters and Toggle Controls Panel */}
      <div className="flex flex-col gap-4 py-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50">
        {/* Notion Style Select Filter */}
        <div className="flex items-center gap-2 select-none self-start sm:self-auto">
          <span className="text-xs font-semibold text-muted-foreground">Filter:</span>
          <Select
            value={filter}
            onValueChange={(val) => setFilter(val as FilterType)}
          >
            <SelectTrigger className="text-xs w-44 bg-background dark:bg-card text-foreground">
              <span>{FILTER_LABELS[filter]}</span>
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border text-popover-foreground">
              <SelectItem value="all">
                <div className="flex items-center justify-between w-full pr-1">
                  <span>All Questions</span>
                  <span className="text-[10px] text-muted-foreground opacity-80">({counts.total})</span>
                </div>
              </SelectItem>
              <SelectItem value="correct">
                <div className="flex items-center justify-between w-full pr-1">
                  <span>Correct</span>
                  <span className="text-[10px] text-emerald-600 font-bold">({counts.correct})</span>
                </div>
              </SelectItem>
              <SelectItem value="incorrect">
                <div className="flex items-center justify-between w-full pr-1">
                  <span>Incorrect</span>
                  <span className="text-[10px] text-destructive font-bold">({counts.incorrect})</span>
                </div>
              </SelectItem>
              <SelectItem value="empty">
                <div className="flex items-center justify-between w-full pr-1">
                  <span>Unanswered</span>
                  <span className="text-[10px] text-muted-foreground/80 font-bold">({counts.empty})</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-right-answer"
              checked={showRightAnswers}
              onCheckedChange={setShowRightAnswers}
            />
            <Label htmlFor="toggle-right-answer" className="text-xs font-semibold text-foreground cursor-pointer select-none">
              Show Correct Answers
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-solution"
              checked={showSolutions}
              onCheckedChange={setShowSolutions}
            />
            <Label htmlFor="toggle-solution" className="text-xs font-semibold text-foreground cursor-pointer select-none">
              Show Solutions
            </Label>
          </div>
        </div>
      </div>

      {/* Detailed Questions Breakdown List */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-1.5 border-b border-border/40 pb-2 text-xs font-bold text-foreground select-none">
          <Layers className="h-4 w-4" /> Performance Breakdown
        </h3>

        {filteredResults.length === 0 ? (
          <div className="py-12 text-center select-none text-muted-foreground">
            <SlidersHorizontal className="mx-auto h-6 w-6 stroke-[1.2] mb-2" />
            <p className="text-xs font-medium">No questions match the current filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredResults.map((res, index) => {
              const isCorrect = res.is_correct
              const qNum = stripMarkdown(res.question_number)

              return (
                <div
                  key={res.question_id || index}
                  className="space-y-3.5 py-6 first:pt-2 last:pb-2"
                >
                  {/* Question Status Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary select-none">
                      {qNum || `Question ${index + 1}:`}
                    </span>
                    <span className="flex items-center gap-1 text-xs select-none">
                      {isCorrect ? (
                        <span className="flex items-center gap-1 font-semibold text-emerald-600">
                          <CheckCircle className="h-3.5 w-3.5" /> Correct
                        </span>
                      ) : !res.student_answer || res.student_answer.trim() === "" ? (
                        <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                          <AlertCircle className="h-3.5 w-3.5" /> Unanswered
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Incorrect
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Stimulus read block */}
                  {res.stimulus_text && (
                    <StimulusBlock text={res.stimulus_text} />
                  )}

                  {/* Stem / Question Description */}
                  <div className="text-xs leading-relaxed font-medium text-foreground md:text-sm">
                    {renderTextWithTables(res.stem)}
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 gap-2 pt-1 pl-2">
                    {res.options.map((opt) => {
                      const isStudentSel = opt.label === res.student_answer
                      const isCorrectAns = opt.label === res.correct_answer

                      let optStyle = "border-transparent text-muted-foreground bg-transparent"
                      const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()

                      let radioBorder = "border-border/60 bg-card"
                      let dotColor = ""
                      let badgeClass = "border-border bg-muted text-muted-foreground"

                      if (isStudentSel) {
                        if (isCorrect) {
                          optStyle = "border-transparent bg-emerald-500/5 text-emerald-700 font-semibold"
                          radioBorder = "border-emerald-500 bg-emerald-500/10"
                          dotColor = "bg-emerald-500"
                          badgeClass = "border-emerald-500 bg-emerald-500 text-white font-semibold"
                        } else {
                          optStyle = "border-transparent bg-destructive/5 text-destructive font-semibold"
                          radioBorder = "border-destructive bg-destructive/10"
                          dotColor = "bg-destructive"
                          badgeClass = "border-destructive bg-destructive text-white font-semibold"
                        }
                      } else if (showRightAnswers && isCorrectAns) {
                        optStyle = "border-transparent bg-emerald-500/5 text-emerald-700 font-medium"
                        radioBorder = "border-emerald-500/30 bg-emerald-500/5"
                        dotColor = "bg-emerald-500/30"
                        badgeClass = "border-emerald-500 bg-emerald-500/70 text-white font-semibold"
                      }

                      return (
                        <div
                          key={opt.label}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-all select-none",
                            optStyle
                          )}
                        >
                          {choiceStyle === "abcd" ? (
                            <span className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all",
                              badgeClass
                            )}>
                              {cleanLabel}
                            </span>
                          ) : (
                            <span className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-all",
                              radioBorder
                            )}>
                              {dotColor && (
                                <span className={cn("h-2 w-2 rounded-full", dotColor)} />
                              )}
                            </span>
                          )}
                          <span className="flex-1 pt-0.5 leading-normal">
                            {stripMarkdown(opt.text)}
                          </span>
                          {isStudentSel && isCorrect && (
                            <Check className="h-4 w-4 shrink-0 self-center text-emerald-500" />
                          )}
                          {isStudentSel && !isCorrect && (
                            <X className="h-4 w-4 shrink-0 self-center text-destructive" />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary Box & Solution */}
                  <div className="space-y-2 rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p className="flex items-center gap-x-4 gap-y-1 flex-wrap">
                      <span>
                        👉 <strong>Your Selection:</strong>{" "}
                        <span
                          className={cn(
                            "font-bold",
                            isCorrect
                              ? "text-emerald-600"
                              : !res.student_answer || res.student_answer.trim() === ""
                              ? "text-muted-foreground"
                              : "text-destructive"
                          )}
                        >
                          {res.student_answer || "Not selected"}
                        </span>
                      </span>
                      {showRightAnswers && (
                        <span>
                          <strong>Correct Answer:</strong>{" "}
                          <span className="font-bold text-emerald-600">
                            {res.correct_answer}
                          </span>
                        </span>
                      )}
                    </p>

                    {showSolutions && res.explanation && (
                      <div className="mt-2 border-t border-border/30 pt-2 leading-relaxed">
                        <strong className="text-foreground/90">💡 Explanation:</strong>{" "}
                        <span className="text-foreground/80">
                          {renderTextWithTables(res.explanation)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
