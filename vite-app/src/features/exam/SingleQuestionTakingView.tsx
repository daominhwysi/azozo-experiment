import { memo } from "react"
import type { Question } from "@/types/exam"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"
import { AnswerOptionList } from "@/features/exam/AnswerOptionList"
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
                  <span className="shrink-0 text-sm font-bold text-primary select-none">
                    {qNum || `Question ${index + 1}:`}
                  </span>
                  <div
                    id={`single-question-${index}-stem`}
                    className="flex-1 text-sm leading-relaxed font-medium text-foreground"
                  >
                    {renderTextWithTables(question.stem)}
                  </div>
                </div>

                <AnswerOptionList
                  question={question}
                  selectedAnswer={studentAnswers[question.id]}
                  isTestRunning={isTestRunning}
                  onSelectOption={onSelectOption}
                  choiceStyle={choiceStyle}
                  labelledBy={`single-question-${index}-stem`}
                />
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
              <div
                id={`single-question-${index}-stem-plain`}
                className="flex-1 text-sm leading-relaxed font-medium text-foreground"
              >
                {renderTextWithTables(question.stem)}
              </div>
            </div>

            <AnswerOptionList
              question={question}
              selectedAnswer={studentAnswers[question.id]}
              isTestRunning={isTestRunning}
              onSelectOption={onSelectOption}
              choiceStyle={choiceStyle}
              labelledBy={`single-question-${index}-stem-plain`}
            />
          </div>
        </div>
      )}
    </div>
  )
})
