import { useState, Fragment } from "react";
import type { Exam, Question } from "@/types/exam";
import { Badge } from "@/components/ui/badge";
import { Clock, Info, Edit, Save, X, Upload, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updateExam, importAnswers } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ExamViewerProps {
  exam: Exam | null;
  onUpdateExam?: (updatedExam: Exam) => void;
  onEditExam?: (exam: Exam) => void;
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

  const parts = text.split(/(<table[\s\S]*?<\/table>)/i);
  return (
    <>
      {parts.map((part, index) => {
        if (part.trim().toLowerCase().startsWith("<table")) {
          return (
            <div
              key={`html-table-${index}`}
              className="overflow-x-auto my-3 border border-border/80 rounded-lg text-[11px] md:text-xs text-left text-muted-foreground [&_table]:min-w-full [&_table]:divide-y [&_table]:divide-border [&_th]:bg-muted/40 [&_th]:font-semibold [&_th]:text-foreground [&_th]:px-3 [&_th]:py-2 [&_th]:border-r [&_th]:border-border/40 [&_th]:last:border-r-0 [&_td]:px-3 [&_td]:py-2 [&_td]:border-r [&_td]:border-border/40 [&_td]:last:border-r-0 [&_tr]:hover:bg-muted/20 [&_tbody]:divide-y [&_tbody]:divide-border/30 [&_tbody]:bg-card"
              dangerouslySetInnerHTML={{ __html: part }}
            />
          );
        } else {
          return renderMarkdownTablesOnly(part, index);
        }
      })}
    </>
  );
}

function renderMarkdownTablesOnly(text: string, partIndex: number): React.ReactNode {
  if (!text) return null;

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
        <div key={`table-${partIndex}-${key}`} className="overflow-x-auto my-3 border border-border/80 rounded-lg">
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
        <span key={`text-${partIndex}-${key}`} className="whitespace-pre-wrap block">
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
      elements.push(<hr key={`divider-${partIndex}-${i}`} className="my-4 border-t border-border/80" />);
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

  return <Fragment key={partIndex}>{elements}</Fragment>;
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
          {qNum || `Question ${index + 1}:`}
        </span>
        <div className="text-xs md:text-sm font-medium text-foreground leading-relaxed flex-1">
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="space-y-1.5 pl-6 mt-2">
        {question.options.map((opt, oIdx) => {
          const cleanOpt = opt.label.replace(/[()]/g, "").trim().toUpperCase();
          const cleanAns = (question.correct_answer || "").replace(/[()]/g, "").trim().toUpperCase();
          const isCorrect = cleanOpt === cleanAns;
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
          <span className="font-semibold text-foreground/70">Explanation: </span>
          {renderTextWithTables(question.explanation)}
        </div>
      )}
    </div>
  );
}

export function ExamViewer({ exam, onUpdateExam, onEditExam }: ExamViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editExam, setEditExam] = useState<Exam | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportAnswers = async () => {
    if (!exam) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const res = await importAnswers(exam.id, importFile, importText);
      if (res.success && res.exam) {
        if (onUpdateExam) {
          onUpdateExam(res.exam);
        }
        setIsImportOpen(false);
        setImportText("");
        setImportFile(null);
        setIsEditing(false);
        setEditExam(null);
        alert("Answers imported and updated successfully!");
      } else {
        setImportError("Processing failed. Please try again.");
      }
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "An error occurred during import.";
      setImportError(errMsg);
    } finally {
      setIsImporting(false);
    }
  };

  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
        <Info className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">No exam selected. Please choose one from the catalog.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editExam) return;
    setIsSaving(true);
    try {
      const updated = await updateExam(exam.id, {
        title: editExam.title,
        subject: editExam.subject,
        grade: editExam.grade,
        duration_minutes: editExam.duration_minutes,
        questions: editExam.questions,
      });
      if (onUpdateExam) {
        onUpdateExam(updated);
      }
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert("An error occurred while saving the exam!");
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing && editExam) {
    return (
      <div className="space-y-6 pb-12">
        {/* Edit Exam Header Card */}
        <div className="border border-border rounded-xl p-6 bg-card space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Đang chỉnh sửa đề thi</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="h-8 gap-1 text-xs"
                disabled={isSaving}
              >
                <X className="h-3.5 w-3.5" /> Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="h-8 gap-1 text-xs"
                disabled={isSaving}
              >
                <Save className="h-3.5 w-3.5" /> {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-3">
              <label className="text-[11px] font-semibold text-muted-foreground">Tiêu đề đề thi</label>
              <Input
                value={editExam.title}
                onChange={(e) => setEditExam({ ...editExam, title: e.target.value })}
                className="h-9 text-xs"
                placeholder="Nhập tiêu đề đề thi"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Môn học</label>
              <Input
                value={editExam.subject}
                onChange={(e) => setEditExam({ ...editExam, subject: e.target.value })}
                className="h-9 text-xs"
                placeholder="Ví dụ: Toán học, Vật lý"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Khối lớp</label>
              <Input
                value={editExam.grade}
                onChange={(e) => setEditExam({ ...editExam, grade: e.target.value })}
                className="h-9 text-xs"
                placeholder="Ví dụ: Lớp 10, Lớp 12"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Thời gian (phút)</label>
              <Input
                type="number"
                value={editExam.duration_minutes}
                onChange={(e) => setEditExam({ ...editExam, duration_minutes: parseInt(e.target.value, 10) || 0 })}
                className="h-9 text-xs"
                placeholder="Thời gian làm bài"
              />
            </div>
          </div>
        </div>

        {/* Edit Questions Card */}
        <div className="bg-card border border-border shadow-xs rounded-xl p-6 md:p-8 space-y-6">
          <h2 className="text-sm font-bold text-foreground">Danh Sách Câu Hỏi ({editExam.questions.length})</h2>
          <div className="divide-y divide-border/30">
            {editExam.questions.map((q, qIdx) => {
              return (
                <div key={q.id || qIdx} className="py-4 border-b border-border/40 last:border-b-0 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs md:text-sm font-bold text-primary shrink-0 select-none pt-2">
                      Câu {qIdx + 1}:
                    </span>
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Nội dung câu hỏi (Stem)</label>
                      <Textarea
                        value={q.stem}
                        onChange={(e) => {
                          const updatedQs = [...editExam.questions];
                          updatedQs[qIdx] = { ...q, stem: e.target.value };
                          setEditExam({ ...editExam, questions: updatedQs });
                        }}
                        className="text-xs min-h-[60px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pl-6">
                    <label className="text-[10px] font-semibold text-muted-foreground block">Các phương án lựa chọn và đáp án đúng</label>
                    <div className="space-y-2">
                      {q.options.map((opt, oIdx) => {
                        const cleanOpt = opt.label.replace(/[()]/g, "").trim().toUpperCase();
                        const cleanAns = (q.correct_answer || "").replace(/[()]/g, "").trim().toUpperCase();
                        const isCorrect = cleanOpt === cleanAns;
                        return (
                          <div key={oIdx} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updatedQs = [...editExam.questions];
                                updatedQs[qIdx] = { ...q, correct_answer: opt.label };
                                setEditExam({ ...editExam, questions: updatedQs });
                              }}
                              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 border transition-all ${
                                isCorrect
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                              }`}
                            >
                              {opt.label}
                            </button>
                            <Input
                              value={opt.text}
                              onChange={(e) => {
                                const updatedOpts = [...q.options];
                                updatedOpts[oIdx] = { ...opt, text: e.target.value };
                                const updatedQs = [...editExam.questions];
                                updatedQs[qIdx] = { ...q, options: updatedOpts };
                                setEditExam({ ...editExam, questions: updatedQs });
                              }}
                              className="h-8 text-xs flex-1"
                              placeholder={`Nội dung phương án ${opt.label}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pl-6 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Giải thích đáp án</label>
                    <Textarea
                      value={q.explanation || ""}
                      onChange={(e) => {
                        const updatedQs = [...editExam.questions];
                        updatedQs[qIdx] = { ...q, explanation: e.target.value };
                        setEditExam({ ...editExam, questions: updatedQs });
                      }}
                      className="text-xs min-h-[40px]"
                      placeholder="Giải thích vì sao chọn đáp án này..."
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="h-8 gap-1 text-xs"
              disabled={isSaving}
            >
              <X className="h-3.5 w-3.5" /> Hủy
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="h-8 gap-1 text-xs"
              disabled={isSaving}
            >
              <Save className="h-3.5 w-3.5" /> {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Exam Header */}
      <div className="border border-border rounded-xl p-6 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{exam.subject}</Badge>
            <Badge variant="secondary">{exam.grade}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {exam.duration_minutes} mins
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  <Upload className="h-3.5 w-3.5" /> Import answers
                </Button>
              } />
              <DialogContent className="sm:max-w-md bg-popover text-popover-foreground rounded-xl border border-border p-5">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-sm font-bold text-foreground">Import Answers with AI</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Paste raw answers (e.g. 1A 2B 3C...) or upload an image/PDF containing the answer sheet. AI will automatically align them.
                  </p>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground block">Raw answer text</label>
                    <Textarea
                      placeholder="Paste raw answers here (e.g. Question 1: A, Question 2: B...)"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      className="text-xs min-h-[100px] bg-card border-border/80"
                      disabled={isImporting}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground block">Or upload Image / PDF file</label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          setImportFile(files[0]);
                        }
                      }}
                      className="text-xs h-9 bg-card border-border/80"
                      disabled={isImporting}
                    />
                    {importFile && (
                      <p className="text-[10px] text-primary font-medium flex items-center gap-1 mt-1">
                        <FileText className="h-3 w-3" /> Selected file: {importFile.name}
                      </p>
                    )}
                  </div>

                  {importError && (
                    <div className="p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs">
                      {importError}
                    </div>
                  )}
                </div>
                <DialogFooter className="flex justify-end gap-2 pt-2 border-t border-border/30">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsImportOpen(false);
                      setImportText("");
                      setImportFile(null);
                      setImportError(null);
                    }}
                    disabled={isImporting}
                    className="text-xs h-8"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImportAnswers}
                    disabled={isImporting || (!importText && !importFile)}
                    className="text-xs h-8"
                  >
                    {isImporting ? "Processing..." : "Process with AI"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (onEditExam && exam) {
                  onEditExam(exam);
                } else {
                  setEditExam(exam);
                  setIsEditing(true);
                }
              }}
              className="h-8 gap-1.5 text-xs"
            >
              <Edit className="h-3.5 w-3.5" /> Edit Exam
            </Button>
          </div>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{exam.title}</h1>
        <p className="text-xs text-muted-foreground">
          Total questions: <span className="font-semibold text-foreground">{exam.questions.length} questions</span>
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

