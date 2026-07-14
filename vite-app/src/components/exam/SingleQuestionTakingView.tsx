import { memo } from "react"
import type { Question } from "@/types/exam"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

interface SingleQuestionTakingViewProps {
  question: Question
  index: number
  totalQuestions: number
  studentAnswers: Record<string, string>
  isTestRunning: boolean
  onSelectOption: (qId: string, label: string) => void
  choiceStyle: "radio" | "abcd"
}

export const SingleQuestionTakingView = memo(function SingleQuestionTakingView({
  question,
  index,
  studentAnswers,
  isTestRunning,
  onSelectOption,
  choiceStyle,
}: SingleQuestionTakingViewProps) {
  const hasStimulus = Boolean(question.stimulus_text)
  const qNum = stripMarkdown(question.question_number)

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {hasStimulus && question.stimulus_text ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 w-full flex-1 items-stretch"
        >
          <ResizablePanel defaultSize={50} className="flex flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto bg-background p-6">
              <div className="font-serif text-sm leading-relaxed text-foreground/90 md:text-base">
                {renderTextWithTables(question.stimulus_text)}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={50} className="flex flex-col">
            <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-5">
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-sm font-bold text-foreground/80 select-none">
                    {qNum || `Question ${index + 1}:`}
                  </span>
                  <div className="flex-1 text-sm leading-relaxed font-normal text-foreground">
                    {renderTextWithTables(question.stem)}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2.5">
                  {question.options.map((opt, oIdx) => {
                    const isSelected = studentAnswers[question.id] === opt.label
                    const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()
                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={!isTestRunning}
                        onClick={() => onSelectOption(question.id, opt.label)}
                        className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left text-xs transition-all select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
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
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl space-y-4 p-5">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-sm font-bold text-foreground/80 select-none">
                {qNum || `Question ${index + 1}:`}
              </span>
              <div className="flex-1 text-sm leading-relaxed font-normal text-foreground">
                {renderTextWithTables(question.stem)}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2.5">
              {question.options.map((opt, oIdx) => {
                const isSelected = studentAnswers[question.id] === opt.label
                const cleanLabel = stripMarkdown(opt.label).replace(/[()]/g, "").trim().toUpperCase()
                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={!isTestRunning}
                    onClick={() => onSelectOption(question.id, opt.label)}
                    className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left text-xs transition-all select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
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
        </div>
      )}
    </div>
  )
})
