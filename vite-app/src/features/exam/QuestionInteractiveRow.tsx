import { memo } from "react"
import type { Question } from "@/types/exam"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"
import { AnswerOptionList } from "@/features/exam/AnswerOptionList"

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
        <div
          id={`question-${index}-stem`}
          className="flex-1 text-xs leading-relaxed font-medium text-foreground md:text-sm"
        >
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="pl-6">
        <AnswerOptionList
          question={question}
          selectedAnswer={selectedAnswer}
          isTestRunning={isTestRunning}
          onSelectOption={onSelectOption}
          choiceStyle={choiceStyle}
          labelledBy={`question-${index}-stem`}
          padding="sm"
        />
      </div>
    </div>
  )
})
