import { memo } from "react"
import type { DetailedResult } from "@/types/exam"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"
import { Check, X } from "lucide-react"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

interface SingleQuestionResultsViewProps {
  result: DetailedResult
  index: number
  totalQuestions: number
  choiceStyle: "radio" | "abcd"
}

export const SingleQuestionResultsView = memo(function SingleQuestionResultsView({
  result,
  index,
  choiceStyle,
}: SingleQuestionResultsViewProps) {
  const hasStimulus = Boolean(result.stimulus_text)
  const qNum = stripMarkdown(result.question_number)
  const isCorrect = result.is_correct

  function getOptionStyles(isSelected: boolean, isCorrectOption: boolean) {
    let optStyle = "border-transparent bg-transparent"
    let radioBorder = "border-border/60 bg-card"
    let dotColor = ""
    let badgeClass = "border-border bg-muted text-muted-foreground"

    if (isSelected) {
      if (isCorrect) {
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

    return { optStyle, radioBorder, dotColor, badgeClass }
  }

  function normalizeOption(s: string) {
    return s.replace(/[()]/g, "").trim().toUpperCase()
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {hasStimulus && result.stimulus_text ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 w-full flex-1 items-stretch"
        >
          <ResizablePanel defaultSize={50} className="flex flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto bg-background p-6">
              <div className="font-serif text-sm leading-relaxed text-foreground/90 md:text-base">
                {renderTextWithTables(result.stimulus_text)}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={50} className="flex flex-col">
            <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-5">
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-sm font-bold text-primary select-none">
                    {qNum || `Question ${index + 1}:`}
                  </span>
                  <div className="flex-1 text-sm leading-relaxed font-medium text-foreground">
                    {renderTextWithTables(result.stem)}
                  </div>
                </div>

                <div className="mt-2 space-y-2.5">
                  {result.options.map((opt, oIdx) => {
                    const cleanOpt = normalizeOption(opt.label)
                    const cleanStudentAns = normalizeOption(result.student_answer || "")
                    const cleanCorrectAns = normalizeOption(result.correct_answer || "")
                    const isSelected = cleanStudentAns === cleanOpt
                    const isCorrectOption = cleanCorrectAns === cleanOpt
                    const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()
                    const { optStyle, radioBorder, dotColor, badgeClass } = getOptionStyles(isSelected, isCorrectOption)

                    return (
                      <div
                        key={oIdx}
                        className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-xs transition-all select-none ${optStyle}`}
                      >
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
                        {isSelected && isCorrect && (
                          <Check className="h-4 w-4 shrink-0 self-center text-emerald-500" />
                        )}
                        {isSelected && !isCorrect && (
                          <X className="h-4 w-4 shrink-0 self-center text-destructive" />
                        )}
                      </div>
                    )
                  })}
                </div>

                {result.explanation && (
                  <div className="mt-3 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs leading-relaxed text-foreground/80">
                    <span className="font-semibold text-foreground/90">
                      Explanation:{" "}
                    </span>
                    {renderTextWithTables(result.explanation)}
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl space-y-4 p-5">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-sm font-bold text-primary select-none">
                {qNum || `Question ${index + 1}:`}
              </span>
              <div className="flex-1 text-sm leading-relaxed font-medium text-foreground">
                {renderTextWithTables(result.stem)}
              </div>
            </div>

            <div className="mt-2 space-y-2.5">
              {result.options.map((opt, oIdx) => {
                const cleanOpt = normalizeOption(opt.label)
                const cleanStudentAns = normalizeOption(result.student_answer || "")
                const cleanCorrectAns = normalizeOption(result.correct_answer || "")
                const isSelected = cleanStudentAns === cleanOpt
                const isCorrectOption = cleanCorrectAns === cleanOpt
                const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()
                const { optStyle, radioBorder, dotColor, badgeClass } = getOptionStyles(isSelected, isCorrectOption)

                return (
                  <div
                    key={oIdx}
                    className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-xs transition-all select-none ${optStyle}`}
                  >
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
                    {isSelected && isCorrect && (
                      <Check className="h-4 w-4 shrink-0 self-center text-emerald-500" />
                    )}
                    {isSelected && !isCorrect && (
                      <X className="h-4 w-4 shrink-0 self-center text-destructive" />
                    )}
                  </div>
                )
              })}
            </div>

            {result.explanation && (
              <div className="mt-3 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs leading-relaxed text-foreground/80">
                <span className="font-semibold text-foreground/90">
                  Explanation:{" "}
                </span>
                {renderTextWithTables(result.explanation)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
