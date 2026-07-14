import { useState } from "react"
import type { Exam, Question } from "@/types/exam"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  Info,
  Edit,
  Save,
  X,
  Upload,
  FileText,
  Play,
  Trash2,
  MoreHorizontal,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { updateExam, importAnswers } from "@/services/api"
import { stripMarkdown, renderTextWithTables } from "@/lib/markdown"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface ExamViewerProps {
  exam: Exam | null
  onUpdateExam?: (updatedExam: Exam) => void
  onEditExam?: (exam: Exam) => void
  onStartExam?: (exam: Exam) => void
  onDeleteExam?: (examId: string) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}

interface StimulusGroup {
  stimulus?: string
  questions: Question[]
}

// Group consecutive questions by their stimulus_text
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

function StimulusBlock({ text }: { text: string }) {
  return (
    <div className="my-4 rounded-lg border border-border/60 bg-card p-5 font-serif text-sm leading-relaxed text-foreground/90 md:text-base">
      {renderTextWithTables(text)}
    </div>
  )
}

function QuestionRow({
  question,
  index,
}: {
  question: Question
  index: number
}) {
  const qNum = stripMarkdown(question.question_number)
  return (
    <div className="space-y-2 border-b border-border/40 py-4 last:border-b-0">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs font-bold text-foreground/80 select-none md:text-sm">
          {qNum || `Question ${index + 1}:`}
        </span>
        <div className="flex-1 text-xs leading-relaxed font-normal text-foreground md:text-sm">
          {renderTextWithTables(question.stem)}
        </div>
      </div>

      <div className="mt-2 space-y-1.5 pl-6">
        {question.options.map((opt, oIdx) => {
          const cleanOpt = opt.label.replace(/[()]/g, "").trim().toUpperCase()
          const cleanAns = (question.correct_answer || "")
            .replace(/[()]/g, "")
            .trim()
            .toUpperCase()
          const isCorrect = cleanOpt === cleanAns
          const cleanLabel = stripMarkdown(opt.label)
          return (
            <div
              key={oIdx}
              className={`flex items-baseline gap-1.5 text-xs leading-relaxed transition-colors ${
                isCorrect
                  ? "font-bold text-primary"
                  : "text-muted-foreground/90"
              }`}
            >
              <span
                className={`shrink-0 font-semibold ${isCorrect ? "text-primary" : "text-muted-foreground"}`}
              >
                {cleanLabel.endsWith(".") || cleanLabel.endsWith(")")
                  ? cleanLabel
                  : `${cleanLabel}.`}
              </span>
              <span>{stripMarkdown(opt.text)}</span>
            </div>
          )
        })}
      </div>

      {question.explanation && (
        <div className="mt-2 ml-6 rounded-lg border border-border/80 bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground/70">
            Explanation:{" "}
          </span>
          {renderTextWithTables(question.explanation)}
        </div>
      )}
    </div>
  )
}

export function ExamViewer({
  exam,
  onUpdateExam,
  onEditExam,
  onStartExam,
  onDeleteExam,
  isExpanded,
  onToggleExpand,
}: ExamViewerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editExam, setEditExam] = useState<Exam | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const handleImportAnswers = async () => {
    if (!exam) return
    setIsImporting(true)
    setImportError(null)
    try {
      const res = await importAnswers(exam.id, importFile, importText)
      if (res.success && res.exam) {
        if (onUpdateExam) {
          onUpdateExam(res.exam)
        }
        setIsImportOpen(false)
        setImportText("")
        setImportFile(null)
        setIsEditing(false)
        setEditExam(null)
        alert("Answers imported and updated successfully!")
      } else {
        setImportError("Processing failed. Please try again.")
      }
    } catch (err) {
      console.error(err)
      const errMsg =
        err instanceof Error ? err.message : "An error occurred during import."
      setImportError(errMsg)
    } finally {
      setIsImporting(false)
    }
  }

  if (!exam) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <Info className="mb-2 h-10 w-10 opacity-50" />
        <p className="text-sm">
          No exam selected. Please choose one from the catalog.
        </p>
      </div>
    )
  }

  const handleSave = async () => {
    if (!editExam) return
    setIsSaving(true)
    try {
      const updated = await updateExam(exam.id, {
        title: editExam.title,
        subject: editExam.subject,
        grade: editExam.grade,
        duration_minutes: editExam.duration_minutes,
        questions: editExam.questions,
      })
      if (onUpdateExam) {
        onUpdateExam(updated)
      }
      setIsEditing(false)
    } catch (err) {
      console.error(err)
      alert("An error occurred while saving the exam!")
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing && editExam) {
    return (
      <div className="space-y-6 pb-12">
        {/* Edit Exam Header Card */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-primary uppercase">
              Đang chỉnh sửa đề thi
            </span>
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
                <Save className="h-3.5 w-3.5" />{" "}
                {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1 md:col-span-3">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Tiêu đề đề thi
              </label>
              <Input
                value={editExam.title}
                onChange={(e) =>
                  setEditExam({ ...editExam, title: e.target.value })
                }
                className="h-9 text-xs"
                placeholder="Nhập tiêu đề đề thi"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Môn học
              </label>
              <Input
                value={editExam.subject}
                onChange={(e) =>
                  setEditExam({ ...editExam, subject: e.target.value })
                }
                className="h-9 text-xs"
                placeholder="Ví dụ: Toán học, Vật lý"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Khối lớp
              </label>
              <Input
                value={editExam.grade}
                onChange={(e) =>
                  setEditExam({ ...editExam, grade: e.target.value })
                }
                className="h-9 text-xs"
                placeholder="Ví dụ: Lớp 10, Lớp 12"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Thời gian (phút)
              </label>
              <Input
                type="number"
                value={editExam.duration_minutes}
                onChange={(e) =>
                  setEditExam({
                    ...editExam,
                    duration_minutes: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="h-9 text-xs"
                placeholder="Thời gian làm bài"
              />
            </div>
          </div>
        </div>

        {/* Edit Questions Card */}
        <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-xs md:p-8">
          <h2 className="text-sm font-bold text-foreground">
            Danh Sách Câu Hỏi ({editExam.questions.length})
          </h2>
          <div className="divide-y divide-border/30">
            {editExam.questions.map((q, qIdx) => {
              return (
                <div
                  key={q.id || qIdx}
                  className="space-y-3 border-b border-border/40 py-4 last:border-b-0"
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 pt-2 text-xs font-bold text-primary select-none md:text-sm">
                      Câu {qIdx + 1}:
                    </span>
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">
                        Nội dung câu hỏi (Stem)
                      </label>
                      <Textarea
                        value={q.stem}
                        onChange={(e) => {
                          const updatedQs = [...editExam.questions]
                          updatedQs[qIdx] = { ...q, stem: e.target.value }
                          setEditExam({ ...editExam, questions: updatedQs })
                        }}
                        className="min-h-[60px] text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pl-6">
                    <label className="block text-[10px] font-semibold text-muted-foreground">
                      Các phương án lựa chọn và đáp án đúng
                    </label>
                    <div className="space-y-2">
                      {q.options.map((opt, oIdx) => {
                        const cleanOpt = opt.label
                          .replace(/[()]/g, "")
                          .trim()
                          .toUpperCase()
                        const cleanAns = (q.correct_answer || "")
                          .replace(/[()]/g, "")
                          .trim()
                          .toUpperCase()
                        const isCorrect = cleanOpt === cleanAns
                        return (
                          <div key={oIdx} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updatedQs = [...editExam.questions]
                                updatedQs[qIdx] = {
                                  ...q,
                                  correct_answer: opt.label,
                                }
                                setEditExam({
                                  ...editExam,
                                  questions: updatedQs,
                                })
                              }}
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
                                isCorrect
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                            >
                              {opt.label}
                            </button>
                            <Input
                              value={opt.text}
                              onChange={(e) => {
                                const updatedOpts = [...q.options]
                                updatedOpts[oIdx] = {
                                  ...opt,
                                  text: e.target.value,
                                }
                                const updatedQs = [...editExam.questions]
                                updatedQs[qIdx] = { ...q, options: updatedOpts }
                                setEditExam({
                                  ...editExam,
                                  questions: updatedQs,
                                })
                              }}
                              className="h-8 flex-1 text-xs"
                              placeholder={`Nội dung phương án ${opt.label}`}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1 pl-6">
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Giải thích đáp án
                    </label>
                    <Textarea
                      value={q.explanation || ""}
                      onChange={(e) => {
                        const updatedQs = [...editExam.questions]
                        updatedQs[qIdx] = { ...q, explanation: e.target.value }
                        setEditExam({ ...editExam, questions: updatedQs })
                      }}
                      className="min-h-[40px] text-xs"
                      placeholder="Giải thích vì sao chọn đáp án này..."
                    />
                  </div>
                </div>
              )
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
              <Save className="h-3.5 w-3.5" />{" "}
              {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Exam Header */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        {/* Title & Actions Row */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <h1 className="flex-1 text-lg leading-snug font-bold tracking-tight text-foreground">
            {exam.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {onStartExam && (
              <Button
                onClick={() => onStartExam(exam)}
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Take Exam
              </Button>
            )}

            {onToggleExpand && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleExpand}
                className="hidden h-8 border-border/80 px-2 text-muted-foreground hover:text-foreground lg:flex"
                title={isExpanded ? "Collapse view" : "Expand view"}
              >
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-border/80 px-2 text-muted-foreground hover:text-foreground"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-40 text-xs">
                <DropdownMenuItem
                  onClick={() => {
                    if (onEditExam && exam) {
                      onEditExam(exam)
                    } else {
                      setEditExam(exam)
                      setIsEditing(true)
                    }
                  }}
                >
                  <Edit className="mr-1 h-3.5 w-3.5" /> Edit Exam
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Import Answers
                </DropdownMenuItem>

                {onDeleteExam && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDeleteExam(exam.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5 text-destructive" />{" "}
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Import dialog */}
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogContent className="rounded-xl border border-border bg-popover p-5 text-popover-foreground sm:max-w-md">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-sm font-bold text-foreground">
                    Import Answers with AI
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Paste raw answers (e.g. 1A 2B 3C...) or upload an image/PDF
                    containing the answer sheet. AI will automatically align
                    them.
                  </p>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-muted-foreground">
                      Raw answer text
                    </label>
                    <Textarea
                      placeholder="Paste raw answers here (e.g. Question 1: A, Question 2: B...)"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      className="min-h-[100px] border-border/80 bg-card text-xs"
                      disabled={isImporting}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-muted-foreground">
                      Or upload Image / PDF file
                    </label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const files = e.target.files
                        if (files && files.length > 0) {
                          setImportFile(files[0])
                        }
                      }}
                      className="h-9 border-border/80 bg-card text-xs"
                      disabled={isImporting}
                    />
                    {importFile && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary">
                        <FileText className="h-3 w-3" /> Selected file:{" "}
                        {importFile.name}
                      </p>
                    )}
                  </div>

                  {importError && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive">
                      {importError}
                    </div>
                  )}
                </div>
                <DialogFooter className="flex justify-end gap-2 border-t border-border/30 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsImportOpen(false)
                      setImportText("")
                      setImportFile(null)
                      setImportError(null)
                    }}
                    disabled={isImporting}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImportAnswers}
                    disabled={isImporting || (!importText && !importFile)}
                    className="h-8 text-xs"
                  >
                    {isImporting ? "Processing..." : "Process with AI"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Metadata Details Row */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-3 text-xs">
          <Badge variant="outline" className="px-2 py-0.5 font-medium">
            {exam.subject}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0.5 font-medium">
            {exam.grade}
          </Badge>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" /> {exam.duration_minutes}{" "}
            mins
          </span>
          <span className="text-border select-none">|</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {exam.questions.length} questions
          </span>
        </div>
      </div>

      {/* Paper Container */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs md:p-8">
        <AllQuestionsView questions={exam.questions} />
      </div>
    </div>
  )
}

function AllQuestionsView({ questions }: { questions: Question[] }) {
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
              <QuestionRow
                key={q.id || `${gi}-${qi}`}
                question={q}
                index={startIndices[gi] + qi}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
