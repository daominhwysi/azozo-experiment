import { memo } from "react"
import type { Question } from "@/types/exam"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"

interface QuestionInteractiveRowProps {
  question: Question
  index: number
  isTestRunning: boolean
  selectedAnswer?: string
  onSelectOption: (qId: string, label: string) => void
  choiceStyle: "radio" | "abcd"
}

export const QuestionInteractiveRow = memo(function QuestionInteractiveRow({
  question,
  index,
  isTestRunning,
  selectedAnswer,
  onSelectOption,
  choiceStyle,
}: QuestionInteractiveRowProps) {
  const qNum = stripMarkdown(question.question_number)
  return (
    <div
      id={`question-${index}`}
      className="scroll-mt-20 space-y-3 border-b border-border/40 py-4 last:border-b-0"
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs font-bold text-primary select-none md:text-sm">
          {qNum || `Question ${index + 1}:`}
        </span>
        <div className="flex-1 text-xs leading-relaxed font-medium text-foreground md:text-sm">
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2.5 pl-6">
        {question.options.map((opt, oIdx) => {
          const isSelected = selectedAnswer === opt.label
          const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()
          return (
            <button
              key={oIdx}
              type="button"
              disabled={!isTestRunning}
              onClick={() => onSelectOption(question.id, opt.label)}
              className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                isSelected
                  ? "border-transparent bg-primary/5 font-semibold text-foreground"
                  : "cursor-pointer border-transparent bg-transparent text-foreground hover:bg-muted/40 disabled:cursor-not-allowed"
              }`}
            >
              {choiceStyle === "abcd" ? (
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground font-extrabold"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {cleanLabel}
                </span>
              ) : (
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border mt-0.5 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-card"
                  }`}
                >
                  {isSelected && (
                    <span className="h-2 w-2 rounded-full bg-primary animate-in zoom-in-50 duration-100" />
                  )}
                </span>
              )}
              <span className="flex-1 pt-0.5 leading-normal">
                {stripMarkdown(opt.text)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
