/* Hallmark · component: PdfAnnotator · genre: modern-minimal · theme: catalog (Notion)
 * states: default · hover · focus-visible · active · disabled · loading · error · success
 * contrast: pass — body copy at 12px minimum, no colour-only status
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
  X,
} from "lucide-react"

interface PdfAnnotatorProps {
  onExamCreated: () => void
  onCreateExamFromScratch?: () => void
}

type InputTab = "file" | "text"

const SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "Literature",
  "History",
  "Geography",
  "Informatics",
  "Civic Education",
]

const GRADES = [
  "Grade 12",
  "Grade 11",
  "Grade 10",
  "Grade 9",
  "Grade 8",
  "Grade 7",
  "Grade 6",
]

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

  // The inline delete confirmation offers "Esc" — make that actually true.
  useEffect(() => {
    if (!confirmDeleteId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDeleteId(null)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [confirmDeleteId])

  const hasMetadata = Boolean(
    examTitleInput && examSubjectInput && examGradeInput && examDurationInput
  )

  const addPdfs = (files: File[], message: string) => {
    const pdfs = files.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    )
    if (pdfs.length === 0) return
    if (!hasMetadata) {
      toast.error(message)
      return
    }
    setPdfFiles((prev) => [...prev, ...pdfs])
  }

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    addPdfs(
      e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [],
      "Please specify Title, Subject, Grade, and Duration before drop!"
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addPdfs(
      e.target.files ? Array.from(e.target.files) : [],
      "Please specify Title, Subject, Grade, and Duration first!"
    )
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
        const queuedCount = pdfFiles.length
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
        await loadTasks()
        toast.success(
          queuedCount > 1
            ? `Background OCR processing for ${queuedCount} files initiated successfully!`
            : "Background OCR processing task initiated. You do not need to wait!"
        )
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
        await loadTasks()
        toast.success(
          "Background OCR processing task initiated. You do not need to wait!"
        )
      }
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

  const canSubmit =
    activeInputTab === "file" ? pdfFiles.length > 0 : rawText.trim().length > 0


  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            OCR &amp; PDF Import
          </h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Upload PDF exam papers or paste raw text. Each job runs sequence
            labeling in the background and is saved to the Exam Bank when it
            finishes.
          </p>
        </div>
        {onCreateExamFromScratch && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateExamFromScratch}
            className="h-8 shrink-0 gap-2 text-xs font-medium"
          >
            <BookOpen aria-hidden="true" className="h-4 w-4" />
            From scratch
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Import composer — ordered the way the task is actually performed */}
        <div className="lg:col-span-7 xl:col-span-8">
          {/* Step 1 — metadata, required before the drop zone will accept files */}
          <section aria-labelledby="step-details" className="pb-8">
            <div className="flex items-baseline gap-3 border-b border-border pb-3">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              >
                1
              </span>
              <div>
                <h2
                  id="step-details"
                  className="text-sm font-semibold text-foreground"
                >
                  Document details
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Metadata applied to the imported exam. Required before
                  uploading.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4 pl-9">
              <div className="space-y-2">
                <label
                  htmlFor="exam-title-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Exam title
                </label>
                <Input
                  id="exam-title-input"
                  value={examTitleInput}
                  onChange={(e) => setExamTitleInput(e.target.value)}
                  className="h-8 max-w-md border-border bg-background text-xs focus-visible:ring-1 focus-visible:ring-ring"
                />
                {activeInputTab === "file" && pdfFiles.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Ignored for multi-file imports — each file is titled after
                    its filename.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label
                    htmlFor="exam-subject-select"
                    className="block text-xs font-medium text-foreground"
                  >
                    Subject
                  </label>
                  <select
                    id="exam-subject-select"
                    value={examSubjectInput}
                    onChange={(e) => setExamSubjectInput(e.target.value)}
                    className="flex h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ring"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="exam-grade-select"
                    className="block text-xs font-medium text-foreground"
                  >
                    Grade level
                  </label>
                  <select
                    id="exam-grade-select"
                    value={examGradeInput}
                    onChange={(e) => setExamGradeInput(e.target.value)}
                    className="flex h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ring"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="exam-duration-input"
                    className="block text-xs font-medium text-foreground"
                  >
                    Duration (minutes)
                  </label>
                  <Input
                    id="exam-duration-input"
                    type="number"
                    min={1}
                    value={examDurationInput}
                    onChange={(e) =>
                      setExamDurationInput(parseInt(e.target.value, 10) || 45)
                    }
                    className="h-8 border-border bg-background text-xs focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Step 2 — source */}
          <section aria-labelledby="step-source">
            <div className="flex items-baseline gap-3 border-b border-border pb-3">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              >
                2
              </span>
              <div>
                <h2
                  id="step-source"
                  className="text-sm font-semibold text-foreground"
                >
                  Source
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Provide the exam as a PDF upload or as raw text.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4 pl-9">
              <div
                role="tablist"
                aria-label="Import source"
                className="flex border-b border-border"
              >
                {(["file", "text"] as const).map((tab) => (
                  <button
                    key={tab}
                    id={`ocr-tab-${tab}`}
                    role="tab"
                    aria-selected={activeInputTab === tab}
                    aria-controls="ocr-tabpanel"
                    tabIndex={activeInputTab === tab ? 0 : -1}
                    onClick={() => setActiveInputTab(tab)}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                      e.preventDefault()
                      const next = activeInputTab === "file" ? "text" : "file"
                      setActiveInputTab(next)
                      document.getElementById(`ocr-tab-${next}`)?.focus()
                    }}
                    className={`relative px-4 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                      activeInputTab === tab
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "file" ? "PDF file upload" : "Raw exam text"}
                    {activeInputTab === tab && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-px bg-foreground"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div
                id="ocr-tabpanel"
                role="tabpanel"
                aria-labelledby={`ocr-tab-${activeInputTab}`}
                className="space-y-4"
              >
                {activeInputTab === "file" ? (
                  <>
                    {/* Drop zone */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Upload PDF files"
                      onDragOver={(e) => {
                        e.preventDefault()
                        setIsDragging(true)
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleFileDrop}
                      onClick={() =>
                        document.getElementById("file-select-inp")?.click()
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          document.getElementById("file-select-inp")?.click()
                        }
                      }}
                      className={`group flex cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        isDragging
                          ? "border-foreground bg-muted/60"
                          : "border-border bg-muted/20 hover:border-foreground/30 hover:bg-muted/40"
                      }`}
                    >
                      <div
                        aria-hidden="true"
                        className={`rounded-full p-3 transition-colors duration-150 ${
                          isDragging
                            ? "bg-foreground/10 text-foreground"
                            : "bg-muted text-muted-foreground group-hover:text-foreground"
                        }`}
                      >
                        <UploadCloud className="h-5 w-5 stroke-[1.5]" />
                      </div>

                      <div className="text-center">
                        <p className="text-xs font-semibold text-foreground">
                          {isDragging
                            ? "Drop PDF files here"
                            : "Drag and drop PDF exam papers"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          or click to browse — .pdf only, multiple files
                          supported
                        </p>
                      </div>

                      <input
                        type="file"
                        id="file-select-inp"
                        accept=".pdf"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>

                    {/* Selected files */}
                    {pdfFiles.length > 0 && (
                      <div className="rounded-lg border border-border">
                        <div className="flex items-center justify-between border-b border-border px-4 py-2">
                          <span className="text-xs font-semibold text-foreground">
                            Selected files ({pdfFiles.length})
                          </span>
                          <button
                            onClick={() => setPdfFiles([])}
                            className="rounded text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            Clear all
                          </button>
                        </div>
                        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                          {pdfFiles.map((file, idx) => (
                            <li
                              key={`${file.name}-${idx}`}
                              className="group/file flex items-center gap-3 px-4 py-2"
                            >
                              <FileText
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 text-muted-foreground stroke-[1.5]"
                              />
                              <span
                                className="min-w-0 flex-1 truncate text-xs text-foreground"
                                title={file.name}
                              >
                                {file.name}
                              </span>
                              <button
                                onClick={() =>
                                  setPdfFiles((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                                aria-label={`Remove ${file.name}`}
                                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring group-hover/file:opacity-100"
                              >
                                <X aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <Textarea
                    id="raw-text-input"
                    aria-label="Exam content"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste exam content here (e.g. Question 1. In space… A. (1;2) B. (2;3)…)"
                    className="min-h-64 w-full resize-y rounded-lg border-border bg-background p-3 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}

                {ocrError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive"
                  >
                    <AlertCircle
                      aria-hidden="true"
                      className="mt-px h-4 w-4 shrink-0"
                    />
                    <span>{ocrError}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Submit — sticks to the bottom of the composer column while scrolling */}
          <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-4 border-t border-border bg-background py-4">
            <p className="text-xs text-muted-foreground">
              {activeInputTab === "file" && pdfFiles.length > 1
                ? `${pdfFiles.length} files will be queued as separate jobs.`
                : "The job runs in the background — you do not need to wait."}
            </p>
            <Button
              onClick={handleStartOcr}
              disabled={isSubmitting || !canSubmit}
              aria-busy={isSubmitting}
              className="h-9 shrink-0 gap-2 px-4 text-xs font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <FileCode aria-hidden="true" className="h-4 w-4" />
                  Convert &amp; run OCR
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Monitoring rail — tracks work already submitted */}
        <div className="lg:col-span-5 xl:col-span-4">
          <section
            aria-labelledby="ocr-jobs-heading"
            className="rounded-lg border border-border bg-card lg:sticky lg:top-6"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2
                id="ocr-jobs-heading"
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                Active OCR jobs
                {activeTaskCount > 0 && (
                  <Badge variant="secondary" className="px-2 py-0 text-xs">
                    {activeTaskCount}
                  </Badge>
                )}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={loadTasks}
                aria-label="Refresh OCR jobs"
                className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>

            <div className="overflow-y-auto lg:max-h-[calc(100vh-10rem)]">
              {tasks.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <FileText
                    aria-hidden="true"
                    className="mx-auto h-8 w-8 text-muted-foreground/50 stroke-[1.5]"
                  />
                  <p className="mt-3 text-xs font-semibold text-foreground">
                    No active OCR jobs
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Submitted jobs appear here and keep running if you navigate
                    away.
                  </p>
                </div>
              ) : (
                <ul
                  aria-live="polite"
                  aria-busy={activeTaskCount > 0}
                  className="divide-y divide-border"
                >
                  {tasks.map((task) => {
                    const isPending = task.status === "pending"
                    const isProcessing = task.status === "processing"
                    const isCompleted = task.status === "completed"
                    const isFailed = task.status === "failed"
                    const isRunning = isPending || isProcessing

                    return (
                      <li key={task.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {isCompleted && (
                                <Check
                                  aria-hidden="true"
                                  className="h-4 w-4 shrink-0 text-success"
                                />
                              )}
                              {isFailed && (
                                <AlertCircle
                                  aria-hidden="true"
                                  className="h-4 w-4 shrink-0 text-destructive"
                                />
                              )}
                              <p
                                className="truncate text-xs font-medium text-foreground"
                                title={task.filename || "Raw Text"}
                              >
                                {task.filename || "Raw Text"}
                              </p>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {task.title}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {isCompleted && (
                              <Badge
                                variant="secondary"
                                className="border-transparent bg-success/10 px-2 py-0 text-xs font-medium text-success"
                              >
                                {task.added_to_bank_id ? "Saved" : "Done"}
                              </Badge>
                            )}
                            {isFailed && (
                              <Badge
                                variant="destructive"
                                className="border-transparent px-2 py-0 text-xs font-medium"
                              >
                                Failed
                              </Badge>
                            )}
                            {isRunning && (
                              <Badge
                                variant="outline"
                                className="gap-1 px-2 py-0 text-xs font-medium"
                              >
                                <Loader2
                                  aria-hidden="true"
                                  className="h-3 w-3 animate-spin"
                                />
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
                                  className="rounded bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive transition-colors duration-150 hover:bg-destructive/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmDeleteId(null)
                                  }}
                                  className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDeleteId(task.id)
                                }}
                                title="Delete task"
                                aria-label={`Delete task ${task.filename || "Raw Text"}`}
                                className="rounded p-1 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isRunning && (
                          <div className="mt-2">
                            <Progress
                              value={task.progress}
                              className="h-1"
                              aria-label={`OCR progress for ${task.filename || "Raw Text"}`}
                              aria-valuetext={`${task.progress}%${task.message ? ` — ${task.message}` : ""}`}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {task.progress}%
                              {task.message ? ` — ${task.message}` : ""}
                            </p>
                          </div>
                        )}

                        {isFailed && task.error && (
                          <p className="mt-2 text-xs text-destructive">
                            {task.error}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
