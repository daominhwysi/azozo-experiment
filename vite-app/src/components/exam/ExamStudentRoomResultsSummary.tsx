import type { TestResult } from "@/types/exam"

interface ExamStudentRoomResultsSummaryProps {
  testResult: TestResult
}

export function ExamStudentRoomResultsSummary({ testResult }: ExamStudentRoomResultsSummaryProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">
        🎉 Assessment Score Report
      </h2>
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/10 p-4 md:grid-cols-4">
        <div className="border-r border-border/40 p-2 text-center last:border-r-0 md:last:border-r">
          <p className="text-xs font-medium text-muted-foreground">Score</p>
          <p className="mt-1 text-xl font-bold text-primary">
            {testResult.score.toFixed(2)} / 10.0
          </p>
        </div>
        <div className="border-r border-border/40 p-2 text-center last:border-r-0 md:last:border-r">
          <p className="text-xs font-medium text-muted-foreground">Correct answers</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {testResult.correct_count} / {testResult.total_questions}
          </p>
        </div>
        <div className="border-r-0 border-border/40 p-2 text-center md:border-r md:last:border-r-0">
          <p className="text-xs font-medium text-muted-foreground">Accuracy rate</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {testResult.percentage}%
          </p>
        </div>
        <div className="p-2 text-center">
          <p className="text-xs font-medium text-muted-foreground">Student name</p>
          <p className="mt-1 text-base font-semibold text-foreground truncate" title={testResult.student_name}>
            {testResult.student_name}
          </p>
        </div>
      </div>
    </div>
  )
}
