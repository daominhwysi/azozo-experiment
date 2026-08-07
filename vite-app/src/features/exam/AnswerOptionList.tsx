import type { Question } from "@/types/exam"
import { stripMarkdown } from "@/lib/markdown"

interface AnswerOptionListProps {
  question: Question
  selectedAnswer?: string
  isTestRunning: boolean
  onSelectOption: (qId: string, label: string) => void
  choiceStyle: "radio" | "abcd"
  /** id of the element holding the question stem, so the group is named. */
  labelledBy: string
  padding?: "sm" | "md"
}

/**
 * A single-select answer group exposed as a proper ARIA radiogroup: selection is
 * announced rather than implied by colour, and arrow keys move between options
 * with a single tab stop per question.
 */
export function AnswerOptionList({
  question,
  selectedAnswer,
  isTestRunning,
  onSelectOption,
  choiceStyle,
  labelledBy,
  padding = "md",
}: AnswerOptionListProps) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="mt-2 grid grid-cols-1 gap-2.5"
    >
      {question.options.map((opt, oIdx) => {
        const isSelected = selectedAnswer === opt.label
        const cleanLabel = stripMarkdown(opt.label)
          .replace(/[()]/g, "")
          .trim()
          .toUpperCase()
        // Roving tabindex: one stop per question, not one per option.
        const isTabStop = selectedAnswer ? isSelected : oIdx === 0

        return (
          <button
            key={oIdx}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isTabStop ? 0 : -1}
            disabled={!isTestRunning}
            onClick={() => onSelectOption(question.id, opt.label)}
            onKeyDown={(e) => {
              if (!isTestRunning) return
              const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]
              if (!keys.includes(e.key)) return
              e.preventDefault()
              const step =
                e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1
              const total = question.options.length
              const next = (oIdx + step + total) % total
              onSelectOption(question.id, question.options[next].label)
              const siblings = e.currentTarget.parentElement?.children
              ;(siblings?.[next] as HTMLElement | undefined)?.focus()
            }}
            className={`flex w-full items-start gap-2.5 rounded-lg border ${
              padding === "sm" ? "p-2.5" : "p-3"
            } text-left text-xs transition-all select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed ${
              isSelected
                ? "border-transparent bg-primary/5 font-semibold text-foreground"
                : "cursor-pointer border-transparent bg-transparent text-foreground hover:bg-muted/40"
            }`}
          >
            {choiceStyle === "abcd" ? (
              <span
                aria-hidden="true"
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
                aria-hidden="true"
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
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
  )
}
