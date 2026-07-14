import type { Question } from "@/types/exam"
import { StimulusBlock } from "./StimulusBlock"
import { QuestionInteractiveRow } from "./QuestionInteractiveRow"

interface StimulusGroup {
  stimulus?: string
  questions: Question[]
}

function groupByStimulus(questions: Question[]): StimulusGroup[] {
  const groups: StimulusGroup[] = []
  for (const q of questions) {
    const stim = q.stimulus_text || undefined
    const last = groups[groups.length - 1]
    if (last && last.stimulus === stim) {
      last.questions.push(q)
    } else {
      groups.push({ stimulus: stim, questions: [q] })
    }
  }
  return groups
}

interface AllQuestionsTakingViewProps {
  questions: Question[]
  studentAnswers: Record<string, string>
  isTestRunning: boolean
  onSelectOption: (qId: string, label: string) => void
  choiceStyle: "radio" | "abcd"
}

export function AllQuestionsTakingView({
  questions,
  studentAnswers,
  isTestRunning,
  onSelectOption,
  choiceStyle,
}: AllQuestionsTakingViewProps) {
  const groups = groupByStimulus(questions)
  const startIndices = groups.map((_, i) =>
    groups.slice(0, i).reduce((acc, g) => acc + g.questions.length, 0)
  )

  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-2">
          {group.stimulus && <StimulusBlock text={group.stimulus} />}
          <div className="divide-y divide-border/30">
            {group.questions.map((q, qi) => (
              <QuestionInteractiveRow
                key={q.id || `${gi}-${qi}`}
                question={q}
                index={startIndices[gi] + qi}
                isTestRunning={isTestRunning}
                selectedAnswer={studentAnswers[q.id]}
                onSelectOption={onSelectOption}
                choiceStyle={choiceStyle}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
