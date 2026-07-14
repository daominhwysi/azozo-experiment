import { useState, useEffect } from "react"
import {
  createOcrTask,
  fetchOcrTasks,
  deleteOcrTask,
} from "@/services/api"
import type { OcrTask } from "@/services/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  UploadCloud,
  Loader2,
  Check,
  FileCode,
  Sliders,
  Trash2,
  AlertCircle,
  RefreshCw,
  BookOpen,
} from "lucide-react"

interface PdfAnnotatorProps {
  onExamCreated: () => void
  onCreateExamFromScratch?: () => void
}

export function PdfAnnotator({ onExamCreated, onCreateExamFromScratch }: PdfAnnotatorProps) {
  const [activeInputTab, setActiveInputTab] = useState<"file" | "text">("file")
  const [pdfFile, setPdfFile] = useState<File | null>(null)
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

  // OCR Background Tasks state
  const [tasks, setTasks] = useState<OcrTask[]>([])

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
      // Check if any task has changed state to trigger user alerts
      setTasks((prev) => {
        activeTasks.forEach((task) => {
          const matchingPrev = prev.find((t) => t.id === task.id)
          if (matchingPrev && matchingPrev.status !== task.status) {
            if (task.status === "completed") {
              alert(
                `🎉 Task "${task.filename || "Raw Text"}" completed successfully and auto-saved to the Exam Bank!`
              )
              onExamCreated()
            } else if (task.status === "failed") {
              alert(
                `❌ Task "${task.filename || "Raw Text"}" failed: ${task.error || "Unknown error"}`
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

  // Poll tasks statuses periodically
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
    const file = e.dataTransfer.files[0]
    if (file) {
      if (
        !examTitleInput ||
        !examSubjectInput ||
        !examGradeInput ||
        !examDurationInput
      ) {
        alert("Please specify Title, Subject, Grade, and Duration before drop!")
        return
      }
      setPdfFile(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (
        !examTitleInput ||
        !examSubjectInput ||
        !examGradeInput ||
        !examDurationInput
      ) {
        alert("Please specify Title, Subject, Grade, and Duration first!")
        return
      }
      setPdfFile(file)
    }
  }

  const handleStartOcr = async () => {
    if (activeInputTab === "file" && !pdfFile) {
      alert("Please upload a PDF file first.")
      return
    }
    if (activeInputTab === "text" && !rawText.trim()) {
      alert("Please enter or paste exam text first.")
      return
    }

    setIsSubmitting(true)
    setOcrError(null)

    try {
      await createOcrTask(
        activeInputTab === "file" ? pdfFile : null,
        activeInputTab === "text" ? rawText : "",
        true, // always auto save to bank since OCR result viewer is removed
        examTitleInput,
        examSubjectInput,
        examGradeInput,
        examDurationInput
      )

      // Reset inputs
      setPdfFile(null)
      setRawText("")

      // Proactively reload lists
      await loadTasks()

      alert(
        "🚀 Background OCR processing task initiated successfully. You do not need to wait!"
      )
    } catch (err) {
      console.error(err)
      const errorMsg = err instanceof Error ? err.message : "Error creating OCR task."
      setOcrError(errorMsg)
      alert("Error creating task: " + errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this task?")) return
    try {
      await deleteOcrTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="mx-auto grid h-full max-w-7xl grid-cols-1 gap-6 pb-12 lg:grid-cols-12">
      {/* Left pane: OCR Input Form */}
      <div className="flex h-full flex-col space-y-5 lg:col-span-8">
        <Card className="flex min-w-0 flex-1 flex-col border-border">
          <CardHeader className="border-b border-border/60 px-4 py-3">
            <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              {activeInputTab === "file" ? "Process PDF File" : "Process Raw Text"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-4 p-4 overflow-y-auto">
            {activeInputTab === "file" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 select-none ${
                  isDragging
                    ? "scale-[0.99] border-primary bg-primary/5 ring-4 ring-primary/10"
                    : "border-border/80 bg-muted/10 hover:border-primary/40 hover:bg-muted/20"
                }`}
                onClick={() =>
                  document.getElementById("file-select-inp")?.click()
                }
              >
                <UploadCloud className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground">
                  {pdfFile ? pdfFile.name : "Drag and drop exam PDF file here"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Or click to select a file from your computer (.pdf)
                </p>
                <input
                  type="file"
                  id="file-select-inp"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste exam content here (e.g. Question 1. In space... A. (1;2) B. (2;3)...)"
                className="min-h-[135px] border-border/80 bg-card text-xs focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}

            {/* New Exam details metadata fields */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-2.5">
              <div className="flex items-center gap-1 border-b border-border/40 pb-1 text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                <Sliders className="h-3 w-3" /> Meta Details
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 items-center">
                <label className="sm:col-span-2 text-[10px] text-muted-foreground font-medium">
                  Title:
                </label>
                <div className="sm:col-span-10">
                  <Input
                    value={examTitleInput}
                    onChange={(e) => setExamTitleInput(e.target.value)}
                    className="h-7 bg-background text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[9px] text-muted-foreground">Subject</label>
                  <select
                    value={examSubjectInput}
                    onChange={(e) => setExamSubjectInput(e.target.value)}
                    className="h-7 w-full cursor-pointer rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:ring-1 focus-visible:ring-ring focus:outline-none"
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
                <div className="space-y-0.5">
                  <label className="text-[9px] text-muted-foreground">Grade</label>
                  <select
                    value={examGradeInput}
                    onChange={(e) => setExamGradeInput(e.target.value)}
                    className="h-7 w-full cursor-pointer rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:ring-1 focus-visible:ring-ring focus:outline-none"
                  >
                    <option value="Grade 12">12</option>
                    <option value="Grade 11">11</option>
                    <option value="Grade 10">10</option>
                    <option value="Grade 9">9</option>
                    <option value="Grade 8">8</option>
                    <option value="Grade 7">7</option>
                    <option value="Grade 6">6</option>
                  </select>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] text-muted-foreground">Duration (mins)</label>
                  <Input
                    type="number"
                    value={examDurationInput}
                    onChange={(e) =>
                      setExamDurationInput(parseInt(e.target.value, 10) || 45)
                    }
                    className="h-7 bg-background text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Error alerts */}
            {ocrError && (
              <div className="flex items-start gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-[11px] leading-relaxed text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{ocrError}</span>
              </div>
            )}

            {/* Trigger Button */}
            <Button
              className="h-9 w-full gap-1.5 text-xs font-semibold"
              onClick={handleStartOcr}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating task...
                </>
              ) : (
                <>
                  <FileCode className="h-4 w-4" /> Start OCR
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right pane: Sidebars */}
      <div className="space-y-5 lg:col-span-4">
        {/* Creation Method selection */}
        <Card className="border-border">
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Creation Method
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Select how you want to build or import your exam.
              </p>
            </div>

            {/* List/Menu options */}
            <div className="space-y-1">
              <button
                onClick={() => setActiveInputTab("file")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  activeInputTab === "file"
                    ? "bg-[#ebebeb] text-[#252525] font-semibold"
                    : "text-[#8f8f8f] hover:bg-[#f7f7f7] hover:text-[#252525]"
                }`}
              >
                <FileCode className="h-4 w-4 shrink-0" />
                <span>Process Pdf file</span>
              </button>

              <button
                onClick={() => setActiveInputTab("text")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  activeInputTab === "text"
                    ? "bg-[#ebebeb] text-[#252525] font-semibold"
                    : "text-[#8f8f8f] hover:bg-[#f7f7f7] hover:text-[#252525]"
                }`}
              >
                <Sliders className="h-4 w-4 shrink-0" />
                <span>Process raw text</span>
              </button>

              <button
                onClick={() => {
                  if (onCreateExamFromScratch) {
                    onCreateExamFromScratch()
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-[#8f8f8f] hover:bg-[#f7f7f7] hover:text-[#252525] transition-colors"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                <span>Exam from scratch</span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Background Task Manager */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-3">
            <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Running OCR Tasks (
              {
                tasks.filter(
                  (t) => t.status === "pending" || t.status === "processing"
                ).length
              }
              )
            </CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={loadTasks}
              className="h-6 w-6 text-muted-foreground"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="max-h-56 divide-y divide-border/40 overflow-y-auto p-2">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No tasks are currently running.
              </div>
            ) : (
              tasks.map((task) => {
                const isPending = task.status === "pending"
                const isProcessing = task.status === "processing"
                const isCompleted = task.status === "completed"
                const isFailed = task.status === "failed"

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-lg p-2.5 text-xs transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className="max-w-[150px] truncate font-semibold text-foreground"
                        title={task.filename || "Raw Text"}
                      >
                        {task.filename || "Raw Text"}
                      </p>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{task.title}</span>
                      </div>

                      {(isPending || isProcessing) && (
                        <Progress value={task.progress} className="mt-1 h-1" />
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isCompleted && (
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-0.5 bg-green-500/10 py-0 text-[9px] text-green-600 hover:bg-green-500/10"
                        >
                          <Check className="h-2.5 w-2.5" />{" "}
                          {task.added_to_bank_id
                            ? "Saved to Bank"
                            : "Completed"}
                        </Badge>
                      )}
                      {isFailed && (
                        <Badge
                          variant="destructive"
                          className="py-0 text-[9px]"
                        >
                          Failed
                        </Badge>
                      )}
                      {(isPending || isProcessing) && (
                        <Badge
                          variant="outline"
                          className="gap-1 py-0 text-[9px]"
                        >
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />{" "}
                          Running
                        </Badge>
                      )}

                      <button
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
