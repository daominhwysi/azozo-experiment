import type { Question } from "@/types/exam";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface QuestionPreviewCardProps {
  question: Question;
  index: number;
}

export function QuestionPreviewCard({ question, index }: QuestionPreviewCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {question.question_number || `Câu ${index + 1}`}
          </Badge>
        </div>
        <CardTitle className="text-xs font-medium leading-relaxed mt-1">
          {question.stem}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {question.options.map((opt, oIdx) => (
            <div
              key={oIdx}
              className="p-2.5 rounded-lg border border-border/80 bg-card hover:bg-accent/40 text-xs flex items-start gap-2 transition-colors"
            >
              <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded text-[11px] min-w-[22px] text-center border border-border/60">
                {opt.label}.
              </span>
              <span className="text-foreground leading-relaxed flex-1 pt-0.5">{opt.text}</span>
            </div>
          ))}
        </div>

        {question.explanation && (
          <div className="p-2 bg-muted/40 rounded text-[11px] text-muted-foreground border border-border/40">
            <span className="font-semibold text-foreground">Lời giải: </span>
            {question.explanation}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
