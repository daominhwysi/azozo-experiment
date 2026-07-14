import type { Question } from "@/types/exam"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { renderTextWithTables } from "@/lib/markdown"

interface QuestionPreviewCardProps {
  question: Question
  index: number
}

export function QuestionPreviewCard({
  question,
  index,
}: QuestionPreviewCardProps) {
  return (
    <Card size="sm" className="border-border shadow-none">
      <CardHeader className="pb-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {question.question_number || `Câu ${index + 1}`}
          </Badge>
          {question.section && (
            <span className="text-xs text-muted-foreground font-medium">
              {question.section}
            </span>
          )}
        </div>

        {question.stimulus_text && (
          <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 font-serif text-sm leading-relaxed text-foreground/90">
            {renderTextWithTables(question.stimulus_text)}
          </div>
        )}

        <CardTitle className="mt-2 text-sm leading-relaxed font-medium text-foreground">
          {renderTextWithTables(question.stem)}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-2 space-y-3">
        <div className="grid grid-cols-1 gap-2">
          {question.options.map((opt, oIdx) => {
            const cleanOpt = opt.label.replace(/[()]/g, "").trim().toUpperCase()
            const cleanAns = (question.correct_answer || "").replace(/[()]/g, "").trim().toUpperCase()
            const isCorrect = cleanOpt && cleanAns && cleanOpt === cleanAns

            return (
              <div
                key={oIdx}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border py-2 px-3 text-xs transition-colors",
                  isCorrect
                    ? "border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-950/10"
                    : "border-border bg-card hover:bg-muted/50"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-semibold",
                    isCorrect
                      ? "border-emerald-500 bg-emerald-500 text-white dark:bg-emerald-600"
                      : "border-border bg-muted text-foreground"
                  )}
                >
                  {opt.label}
                </span>
                <span
                  className={cn(
                    "flex-1 pt-0.5 leading-relaxed",
                    isCorrect ? "font-medium text-foreground" : "text-foreground/90"
                  )}
                >
                  {opt.text}
                </span>
              </div>
            )
          })}
        </div>

        {question.explanation && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-foreground/80 leading-relaxed">
            <span className="font-semibold text-foreground">Lời giải: </span>
            {renderTextWithTables(question.explanation)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

