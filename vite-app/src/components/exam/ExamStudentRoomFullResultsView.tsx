import type { DetailedResult } from "@/types/exam"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"
import { Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { StimulusBlock } from "./StimulusBlock"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FullResultsViewProps {
  detailedResults: DetailedResult[]
  viewMode: "full" | "single"
  setViewMode: (mode: "full" | "single") => void
  singleView: React.ReactNode
  choiceStyle: "radio" | "abcd"
}

function normalizeOption(s: string) {
  return s.replace(/[()]/g, "").trim().toUpperCase()
}

function ResultOption({ opt, result, choiceStyle }: { opt: { label: string; text: string }; result: DetailedResult; choiceStyle: "radio" | "abcd" }) {
  const cleanOpt = normalizeOption(opt.label)
  const cleanStudentAns = normalizeOption(result.student_answer || "")
  const cleanCorrectAns = normalizeOption(result.correct_answer || "")
  const isSelected = cleanStudentAns === cleanOpt
  const isCorrectOption = cleanCorrectAns === cleanOpt
  const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()

  let optStyle = "border-transparent bg-transparent"
  let radioBorder = "border-border/60 bg-card"
  let dotColor = ""
  let badgeClass = "border-border bg-muted text-muted-foreground"

  if (isSelected) {
    if (result.is_correct) {
      optStyle =
        "border-transparent bg-emerald-500/10 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400 font-semibold"
      radioBorder = "border-emerald-500 bg-emerald-500/10"
      dotColor = "bg-emerald-500"
      badgeClass = "border-emerald-500 bg-emerald-500 text-white font-extrabold"
    } else {
      optStyle =
        "border-transparent bg-destructive/5 text-destructive font-semibold"
      radioBorder = "border-destructive bg-destructive/5"
      dotColor = "bg-destructive"
      badgeClass = "border-destructive bg-destructive text-white font-extrabold"
    }
  } else if (isCorrectOption) {
    optStyle =
      "border-transparent bg-emerald-500/5 dark:bg-emerald-950/5 text-emerald-700 dark:text-emerald-400"
    radioBorder = "border-emerald-500/30 bg-emerald-500/5"
    dotColor = "bg-emerald-500/40"
    badgeClass = "border-emerald-500 bg-emerald-500/80 text-white font-extrabold"
  }

  return (
    <div className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-all select-none ${optStyle}`}>
      {choiceStyle === "abcd" ? (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all ${badgeClass}`}>
          {cleanLabel}
        </span>
      ) : (
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-all ${radioBorder}`}>
          {dotColor && (
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          )}
        </span>
      )}
      <span className="flex-1 pt-0.5 leading-normal">
        {stripMarkdown(opt.text)}
      </span>
      {isSelected && result.is_correct && (
        <Check className="h-4 w-4 shrink-0 self-center text-emerald-500" />
      )}
      {isSelected && !result.is_correct && (
        <X className="h-4 w-4 shrink-0 self-center text-destructive" />
      )}
    </div>
  )
}

export function ExamStudentRoomFullResultsView({
  detailedResults,
  viewMode,
  setViewMode,
  singleView,
  choiceStyle,
}: FullResultsViewProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs md:p-6">
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <h2 className="text-sm font-bold text-foreground">
          Assessment Graded Report
        </h2>
        <Select
          value={viewMode}
          onValueChange={(val) => setViewMode(val as "full" | "single")}
        >
          <SelectTrigger className="text-xs w-36 bg-background dark:bg-card text-foreground">
            <SelectValue placeholder="View mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">All Questions</SelectItem>
            <SelectItem value="single">One by One</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {viewMode === "full" ? (
        <div className="divide-y divide-border/30">
          {detailedResults.map((res, idx) => {
            const qNum = stripMarkdown(res.question_number)
            const prevRes = idx > 0 ? detailedResults[idx - 1] : null
            const showStimulus =
              res.stimulus_text && (!prevRes || prevRes.stimulus_text !== res.stimulus_text)
            return (
              <div key={res.question_id || idx} className="space-y-2">
                {showStimulus && res.stimulus_text && (
                  <div className="mt-4 first:mt-0">
                    <StimulusBlock text={res.stimulus_text} />
                  </div>
                )}
                <div
                  id={`review-question-${idx}`}
                  className="scroll-mt-20 space-y-3 border-b border-border/40 py-4 last:border-b-0"
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-bold text-foreground/80 select-none md:text-sm">
                      {qNum || `Question ${idx + 1}:`}
                    </span>
                    <div className="flex-1 text-xs leading-relaxed font-normal text-foreground md:text-sm">
                      {renderTextWithTables(res.stem)}
                    </div>
                    <Badge
                      variant={res.is_correct ? "default" : "destructive"}
                      className="shrink-0 py-0.5 text-xs font-semibold"
                    >
                      {res.is_correct ? "Correct" : "Incorrect"}
                    </Badge>
                  </div>

                  <div className="mt-2 space-y-2 pl-6">
                    {res.options.map((opt, oIdx) => (
                      <ResultOption key={oIdx} opt={opt} result={res} choiceStyle={choiceStyle} />
                    ))}
                  </div>

                  {res.explanation && (
                    <div className="mt-3 ml-6 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs leading-relaxed text-foreground/80">
                      <span className="font-semibold text-foreground/90">
                        Explanation:{" "}
                      </span>
                      {renderTextWithTables(res.explanation)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{singleView}</div>
      )}
    </div>
  )
}
