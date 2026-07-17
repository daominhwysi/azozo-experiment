/* Hallmark · component: PdfAnnotator · genre: modern-minimal · theme: catalog (Notion)
 * states: default · hover · focus-visible · active · disabled · loading · error · success
 * contrast: pass (40-41)
 */
import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  createOcrTask,
  fetchOcrTasks,
  deleteOcrTask,
} from "@/services/api"
import type { OcrTask } from "@/services/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  UploadCloud,
  Loader2,
  Check,
  FileCode,
  Trash2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  FileText,
} from "lucide-react"

interface PdfAnnotatorProps {
  onExamCreated: () => void
  onCreateExamFromScratch?: () => void
}

type InputTab = "file" | "text"

export function PdfAnnotator({ onExamCreated, onCreateExamFromScratch }: PdfAnnotatorProps) {
  const [activeInputTab, setActiveInputTab] = useState<InputTab>("file")
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [rawText, setRawText] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [examTitleInput, setExamTitleInput] = useState(
    "Trial Graduation Assessment 2026"
  )
  const [examSubjectInput, setExamSubjectInput] = useState("Mathematics")
  const [examGradeInput, setExamGradeInput] = useState("Grade 12")
  const [examDurationInput, setExamDurationInput] = useState(45)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)

  const [tasks, setTasks] = useState<OcrTask[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadTasks = async () => {
    try {
      const activeTasks = await fetchOcrTasks()
      setTasks(activeTasks)
    } catch (e) {
      console.error("Failed to load OCR tasks", e)
    }
  }

  const pollRunningTasks = async () => {
    try {
      const activeTasks = await fetchOcrTasks()
      setTasks((prev) => {
        activeTasks.forEach((task) => {
          const matchingPrev = prev.find((t) => t.id === task.id)
          if (matchingPrev && matchingPrev.status !== task.status) {
            if (task.status === "completed") {
              toast.success(
                `Task "${task.filename || "Raw Text"}" completed successfully and auto-saved to the Exam Bank!`
              )
              onExamCreated()
            } else if (task.status === "failed") {
              toast.error(
                `Task "${task.filename || "Raw Text"}" failed: ${task.error || "Unknown error"}`
              )
            }
          }
        })
        return activeTasks
      })
    } catch (e) {
      console.warn("Poll tasks failed: backend offline", e)
    }
  }

  useEffect(() => {
    loadTasks()
    const interval = setInterval(() => {
      pollRunningTasks()
    }, 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
    const pdfs = files.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    )
    if (pdfs.length > 0) {
      if (
        !examTitleInput ||
        !examSubjectInput ||
        !examGradeInput ||
        !examDurationInput
      ) {
        toast.error("Please specify Title, Subject, Grade, and Duration before drop!")
        return
      }
      setPdfFiles((prev) => [...prev, ...pdfs])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    const pdfs = files.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    )
    if (pdfs.length > 0) {
      if (
        !examTitleInput ||
        !examSubjectInput ||
        !examGradeInput ||
        !examDurationInput
      ) {
        toast.error("Please specify Title, Subject, Grade, and Duration first!")
        return
      }
      setPdfFiles((prev) => [...prev, ...pdfs])
    }
  }

  const handleStartOcr = async () => {
    if (activeInputTab === "file" && pdfFiles.length === 0) {
      toast.error("Please upload at least one PDF file first.")
      return
    }
    if (activeInputTab === "text" && !rawText.trim()) {
      toast.error("Please enter or paste exam text first.")
      return
    }

    setIsSubmitting(true)
    setOcrError(null)

    try {
      if (activeInputTab === "file") {
        await Promise.all(
          pdfFiles.map((file) => {
            const fileTitle =
              pdfFiles.length > 1
                ? file.name.replace(/\.[^/.]+$/, "")
                : examTitleInput
            return createOcrTask(
              file,
              "",
              true,
              fileTitle,
              examSubjectInput,
              examGradeInput,
              examDurationInput
            )
          })
        )
        setPdfFiles([])
      } else {
        await createOcrTask(
          null,
          rawText,
          true,
          examTitleInput,
          examSubjectInput,
          examGradeInput,
          examDurationInput
        )
        setRawText("")
      }

      await loadTasks()

      toast.success(
        activeInputTab === "file" && pdfFiles.length > 1
          ? `Background OCR processing for ${pdfFiles.length} files initiated successfully!`
          : "Background OCR processing task initiated. You do not need to wait!"
      )
    } catch (err) {
      console.error(err)
      const errorMsg = err instanceof Error ? err.message : "Error creating OCR task."
      setOcrError(errorMsg)
      toast.error("Error creating task: " + errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTaskConfirm = async (taskId: string) => {
    try {
      await deleteOcrTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      toast.success("Task deleted successfully")
      if (confirmDeleteId === taskId) {
        setConfirmDeleteId(null)
      }
    } catch (e) {
      console.error(e)
      toast.error("Failed to delete task")
    }
  }

  const activeTaskCount = tasks.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length

  return (
    <div className="mx-auto flex flex-col h-full max-w-7xl pb-12 gap-5">
      {/* Page Header */}
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              OCR & PDF Import
            </h1>
          </div>
          <p className="text-xs text-muted-foreground max-w-lg">
            Upload a PDF exam paper or paste raw text to run sequence labeling and convert to interactive questions.
          </p>
        </div>
        {onCreateExamFromScratch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateExamFromScratch}
            className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5" />
            From scratch
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Input Canvas */}
        <div className="lg:col-span-8 space-y-4">
          {/* Tab Selector */}
          <div className="flex gap-0 border-b border-border">
            {(["file", "text"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveInputTab(tab)}
                aria-selected={activeInputTab === "tab"}
                role="tab"
                className={`
                  relative px-4 py-2 text-xs font-medium transition-colors duration-150
                  focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring
                  ${activeInputTab === tab
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                {tab === "file" ? "PDF File Upload" : "Raw Exam Text"}
                {activeInputTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                )}
              </button>
            ))}
          </div>

          {/* Main Input Sheet */}
          <div className="rounded-lg border border-border bg-card p-5">
            {activeInputTab === "file" ? (
              <div className="space-y-3">
                {/* Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload PDF files"
                  onClick={() =>
                    document.getElementById("file-select-inp")?.click()
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      document.getElementById("file-select-inp")?.click()
                    }
                  }}
                  className={`
                    group relative flex flex-col items-center justify-center gap-2
                    rounded-md border-2 border-dashed p-8
                    transition-all duration-200 select-none cursor-pointer
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
                    ${isDragging
                      ? "border-primary bg-primary/[0.03] scale-[0.99]"
                      : pdfFiles.length > 0
                        ? "border-border bg-muted/30 hover:border-foreground/30"
                        : "border-border/60 bg-muted/20 hover:border-foreground/20 hover:bg-muted/40"
                    }
                  `}
                >
                  <div className={`
                    rounded-full p-2.5 transition-colors duration-150
                    ${isDragging
                      ? "bg-primary/10 text-primary"
                      : pdfFiles.length > 0
                        ? "bg-foreground/5 text-foreground"
                        : "bg-muted text-muted-foreground group-hover:text-foreground"
                    }
                  `}>
                    <UploadCloud className="h-5 w-5" />
                  </div>

                  {pdfFiles.length > 0 ? (
                    <div className="text-center">
                      <p className="text-xs font-medium text-foreground">
                        {pdfFiles.length} file{pdfFiles.length !== 1 ? "s" : ""} selected
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Drop more files or click to add
                      </p>
                    </div>
                  ) : isDragging ? (
                    <p className="text-xs font-medium text-primary">
                      Drop PDF files here
                    </p>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-medium text-foreground">
                        Drag and drop PDF exam papers here
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        or click to browse (.pdf)
                      </p>
                    </div>
                  )}

                  <input
                    type="file"
                    id="file-select-inp"
                    accept=".pdf"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* Selected Files List */}
                {pdfFiles.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/20">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Selected Files ({pdfFiles.length})
                      </span>
                      <button
                        onClick={() => setPdfFiles([])}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        Clear all
                      </button>
                    </div>
                    <ul className="max-h-32 overflow-y-auto divide-y divide-border/40">
                      {pdfFiles.map((file, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 px-3 py-1.5 group/file"
                        >
                          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-[11px] text-foreground font-medium" title={file.name}>
                            {file.name}
                          </span>
                          <button
                            onClick={() => setPdfFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="opacity-0 group-hover/file:opacity-100 text-[10px] text-muted-foreground hover:text-destructive transition-all duration-100 focus-visible:outline-none"
                            aria-label={`Remove ${file.name}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste exam content here (e.g. Question 1. In space… A. (1;2) B. (2;3)…)"
                className="min-h-[200px] w-full border-border bg-background text-xs placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring focus:outline-none resize-y p-3 rounded-md"
              />
            )}

            {/* Error Alert */}
            {ocrError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{ocrError}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="mt-5 flex justify-end">
              <Button
                className="h-9 px-5 gap-1.5 text-xs font-medium"
                onClick={handleStartOcr}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <FileCode className="h-3.5 w-3.5" /> Convert & Run OCR
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Settings & Tasks */}
        <div className="lg:col-span-4 space-y-5">
          {/* Metadata Card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-foreground">
                Document Details
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Configure metadata for the new exam.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="exam-title-input"
                  className="text-[11px] font-medium text-foreground"
                >
                  Exam Title
                </label>
                <Input
                  id="exam-title-input"
                  value={examTitleInput}
                  onChange={(e) => setExamTitleInput(e.target.value)}
                  className="h-8 bg-background text-xs border-border focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="exam-subject-select"
                    className="text-[11px] font-medium text-foreground"
                  >
                    Subject
                  </label>
                  <select
                    id="exam-subject-select"
                    value={examSubjectInput}
                    onChange={(e) => setExamSubjectInput(e.target.value)}
                    className="flex h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2.5 text-xs text-foreground transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ring"
                  >
                    <option value="Mathematics">Mathematics</option>
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Biology">Biology</option>
                    <option value="English">English</option>
                    <option value="Literature">Literature</option>
                    <option value="History">History</option>
                    <option value="Geography">Geography</option>
                    <option value="Informatics">Informatics</option>
                    <option value="Civic Education">Civic Education</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="exam-grade-select"
                    className="text-[11px] font-medium text-foreground"
                  >
                    Grade Level
                  </label>
                  <select
                    id="exam-grade-select"
                    value={examGradeInput}
                    onChange={(e) => setExamGradeInput(e.target.value)}
                    className="flex h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2.5 text-xs text-foreground transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ring"
                  >
                    <option value="Grade 12">Grade 12</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 10">Grade 10</option>
                    <option value="Grade 9">Grade 9</option>
                    <option value="Grade 8">Grade 8</option>
                    <option value="Grade 7">Grade 7</option>
                    <option value="Grade 6">Grade 6</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="exam-duration-input"
                  className="text-[11px] font-medium text-foreground"
                >
                  Duration (minutes)
                </label>
                <Input
                  id="exam-duration-input"
                  type="number"
                  value={examDurationInput}
                  onChange={(e) =>
                    setExamDurationInput(parseInt(e.target.value, 10) || 45)
                  }
                  className="h-8 bg-background text-xs border-border focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Active OCR Jobs */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h2 className="text-xs font-semibold text-foreground">
                Active OCR Jobs
                {activeTaskCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                    {activeTaskCount}
                  </span>
                )}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={loadTasks}
                className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Refresh tasks"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {tasks.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="inline-flex rounded-full bg-muted p-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    No active OCR jobs
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    Submit a file or text to start processing
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {tasks.map((task) => {
                    const isPending = task.status === "pending"
                    const isProcessing = task.status === "processing"
                    const isCompleted = task.status === "completed"
                    const isFailed = task.status === "failed"

                    return (
                      <div
                        key={task.id}
                        className="px-3 py-2.5 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5">
                              {isCompleted && (
                                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-green-500/10 shrink-0">
                                  <Check className="h-2 w-2 text-green-600" />
                                </span>
                              )}
                              {isFailed && (
                                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-destructive/10 shrink-0">
                                  <AlertCircle className="h-2 w-2 text-destructive" />
                                </span>
                              )}
                              <p
                                className="truncate text-[11px] font-medium text-foreground"
                                title={task.filename || "Raw Text"}
                              >
                                {task.filename || "Raw Text"}
                              </p>
                            </div>
                            <p className="truncate text-[10px] text-muted-foreground pl-5">
                              {task.title}
                            </p>
                            {(isPending || isProcessing) && (
                              <div className="pl-5">
                                <Progress value={task.progress} className="h-1" />
                                <p className="text-[9px] text-muted-foreground mt-1">
                                  {task.progress}%{task.message ? ` — ${task.message}` : ""}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                            {isCompleted && (
                              <Badge
                                variant="secondary"
                                className="bg-green-500/10 text-green-600 border-transparent text-[9px] font-medium px-1.5 py-0"
                              >
                                {task.added_to_bank_id ? "Saved" : "Done"}
                              </Badge>
                            )}
                            {isFailed && (
                              <Badge
                                variant="destructive"
                                className="text-[9px] font-medium px-1.5 py-0 border-transparent"
                              >
                                Failed
                              </Badge>
                            )}
                            {(isPending || isProcessing) && (
                              <Badge
                                variant="outline"
                                className="gap-1 text-[9px] font-medium px-1.5 py-0"
                              >
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                Running
                              </Badge>
                            )}

                            {confirmDeleteId === task.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteTaskConfirm(task.id)
                                  }}
                                  className="rounded bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold text-destructive hover:bg-destructive/25 transition-colors duration-150 active:translate-y-px"
                                >
                                  OK
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmDeleteId(null)
                                  }}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:bg-muted-foreground/10 transition-colors duration-150 active:translate-y-px"
                                >
                                  Esc
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDeleteId(task.id)
                                }}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring"
                                title="Delete task"
                                aria-label={`Delete task ${task.filename || "Raw Text"}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
