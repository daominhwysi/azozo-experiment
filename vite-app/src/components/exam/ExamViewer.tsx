import type { Exam, Question } from "@/types/exam";
import { Badge } from "@/components/ui/badge";
import { Clock, Info } from "lucide-react";

interface ExamViewerProps {
  exam: Exam | null;
}

interface StimulusGroup {
  stimulus?: string;
  questions: Question[];
}

// Group consecutive questions by their stimulus_text
function groupByStimulus(questions: Question[]): StimulusGroup[] {
  const groups: StimulusGroup[] = [];
  for (const q of questions) {
    const stim = q.stimulus_text || undefined;
    const last = groups[groups.length - 1];
    if (last && last.stimulus === stim) {
      last.questions.push(q);
    } else {
      groups.push({ stimulus: stim, questions: [q] });
    }
  }
  return groups;
}

function stripMarkdown(text: string | undefined | null): string {
  if (!text) return "";
  return text
    // Remove headers
    .replace(/^#+\s+/gm, '')
    // Remove bold/italic formatting
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove inline code block formatting
    .replace(/`([^`]+)`/g, '$1')
    // Remove links
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove blockquotes
    .replace(/^\s*>\s+/gm, '')
    // Remove list markers
    .replace(/^\s*[\-\*\+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .trim();
}

function renderTextWithTables(text: string | undefined | null): React.ReactNode {
  if (!text) return "";

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentTableRows: string[][] = [];
  let isInsideTable = false;

  const flushTable = (key: string | number) => {
    if (currentTableRows.length === 0) return;

    const isSeparatorRow = (row: string[]) => {
      const joinStr = row.join("").trim();
      return /^[|\-:\s]+$/.test(joinStr) && joinStr.includes("-");
    };

    const hasSeparator = currentTableRows.some(isSeparatorRow);

    const cleanedRows = currentTableRows.filter(row => !isSeparatorRow(row));

    if (cleanedRows.length > 0) {
      const headerCandidate = cleanedRows[0];
      const isHeaderEmpty = headerCandidate.every(cell => !cell.trim());

      let headers: string[] = [];
      let bodyRows: string[][] = [];

      if (hasSeparator) {
        if (isHeaderEmpty) {
          headers = [];
          bodyRows = cleanedRows.slice(1);
        } else {
          headers = headerCandidate;
          bodyRows = cleanedRows.slice(1);
        }
      } else {
        headers = [];
        bodyRows = cleanedRows;
      }

      elements.push(
        <div key={`table-${key}`} className="overflow-x-auto my-3 border border-border/80 rounded-lg">
          <table className="min-w-full divide-y divide-border text-[11px] md:text-xs text-left">
            {headers.length > 0 && (
              <thead className="bg-muted/40 font-semibold text-foreground">
                <tr>
                  {headers.map((cell, idx) => (
                    <th key={idx} className="px-3 py-2 border-r border-border/40 last:border-r-0">
                      {stripMarkdown(cell.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-border/30 bg-card">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/20">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 border-r border-border/40 last:border-r-0 text-muted-foreground">
                      {stripMarkdown(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    currentTableRows = [];
    isInsideTable = false;
  };

  let textAccumulator: string[] = [];
  const flushText = (key: string | number) => {
    if (textAccumulator.length > 0) {
      elements.push(
        <span key={`text-${key}`} className="whitespace-pre-wrap block">
          {stripMarkdown(textAccumulator.join("\n"))}
        </span>
      );
      textAccumulator = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableRow = line.startsWith("|") && line.endsWith("|");
    const isDivider = /^[-*_]{3,}\s*$/.test(line);

    if (isTableRow) {
      if (!isInsideTable) {
        flushText(i);
        isInsideTable = true;
      }
      const cols = line.split("|").slice(1, -1).map(c => c.trim());
      currentTableRows.push(cols);
    } else if (isDivider) {
      if (isInsideTable) {
        flushTable(i);
      } else {
        flushText(i);
      }
      elements.push(<hr key={`divider-${i}`} className="my-4 border-t border-border/80" />);
    } else {
      if (isInsideTable) {
        flushTable(i);
      }
      textAccumulator.push(lines[i]);
    }
  }

  if (isInsideTable) {
    flushTable("end");
  } else {
    flushText("end");
  }

  return <>{elements}</>;
}

function StimulusBlock({ text }: { text: string }) {
  return (
    <div className="p-4 my-4 bg-muted/30 border-l-3 border-primary/40 rounded-r-lg text-xs md:text-sm text-foreground/80 leading-relaxed font-mono">
      {renderTextWithTables(text)}
    </div>
  );
}

function QuestionRow({ question, index }: { question: Question; index: number }) {
  const qNum = stripMarkdown(question.question_number);
  return (
    <div className="py-4 border-b border-border/40 last:border-b-0 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-xs md:text-sm font-bold text-primary shrink-0 select-none">
          {qNum || `Câu ${index + 1}:`}
        </span>
        <div className="text-xs md:text-sm font-medium text-foreground leading-relaxed flex-1">
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="space-y-1.5 pl-6 mt-2">
        {question.options.map((opt, oIdx) => {
          const isCorrect = opt.label.toUpperCase() === (question.correct_answer || "").toUpperCase();
          const cleanLabel = stripMarkdown(opt.label);
          return (
            <div
              key={oIdx}
              className={`text-xs flex items-baseline gap-1.5 transition-colors leading-relaxed ${
                isCorrect ? "text-primary font-bold" : "text-muted-foreground/90"
              }`}
            >
              <span className={`font-semibold shrink-0 ${isCorrect ? "text-primary" : "text-muted-foreground"}`}>
                {cleanLabel.endsWith(".") || cleanLabel.endsWith(")") ? cleanLabel : `${cleanLabel}.`}
              </span>
              <span>{stripMarkdown(opt.text)}</span>
            </div>
          );
        })}
      </div>

      {question.explanation && (
        <div className="mt-2 ml-6 p-2 bg-muted/20 border-l-2 border-border/80 text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground/70">Giải thích: </span>
          {renderTextWithTables(question.explanation)}
        </div>
      )}
    </div>
  );
}

export function ExamViewer({ exam }: ExamViewerProps) {
  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
        <Info className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">Chưa chọn đề thi nào. Vui lòng chọn một đề từ ngân hàng.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Exam Header */}
      <div className="border border-border rounded-xl p-6 bg-card space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{exam.subject}</Badge>
          <Badge variant="secondary">{exam.grade}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {exam.duration_minutes} phút
          </span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{exam.title}</h1>
        <p className="text-xs text-muted-foreground">
          Tổng số câu hỏi: <span className="font-semibold text-foreground">{exam.questions.length} câu</span>
        </p>
      </div>

      {/* Paper Container */}
      <div className="bg-card border border-border shadow-xs rounded-xl p-6 md:p-8">
        <AllQuestionsView questions={exam.questions} />
      </div>
    </div>
  );
}

function AllQuestionsView({ questions }: { questions: Question[] }) {
  const groups = groupByStimulus(questions);
  const startIndices = groups.map((_, i) =>
    groups.slice(0, i).reduce((acc, g) => acc + g.questions.length, 0)
  );

  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-2">
          {group.stimulus && <StimulusBlock text={group.stimulus} />}
          <div className="divide-y divide-border/30">
            {group.questions.map((q, qi) => (
              <QuestionRow key={q.id || `${gi}-${qi}`} question={q} index={startIndices[gi] + qi} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

