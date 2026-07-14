import { useState, useMemo, useEffect } from "react"
import type { Exam } from "@/types/exam"
import {
  Search,
  Plus,
  AlertTriangle,
  UploadCloud,
  FileText,
  ArrowLeft,
  SlidersHorizontal,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { ExamViewer } from "./ExamViewer"
import { cn } from "@/lib/utils"

interface ExamBankProps {
  exams: Exam[]
  selectedExam: Exam | null
  setSelectedExam: (exam: Exam | null) => void
  onOpenOcrTab: () => void
  onStartExam: (exam: Exam) => void
  onDeleteExam: (examId: string) => void
  onUpdateExam: (updatedExam: Exam) => void
  onEditExam: (exam: Exam | null) => void
}

export function ExamBank({
  exams,
  selectedExam,
  setSelectedExam,
  onOpenOcrTab,
  onStartExam,
  onDeleteExam,
  onUpdateExam,
  onEditExam,
}: ExamBankProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSubject, setSelectedSubject] = useState<string>("all")
  const [selectedGrade, setSelectedGrade] = useState<string>("all")
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null)
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)

  // Screen size detector state
  const [isLargeScreen, setIsLargeScreen] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  )
  useEffect(() => {
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const examToDelete = deletingExamId
    ? exams.find((e) => e.id === deletingExamId)
    : null

  // Extract unique subjects and grades for filter selectors
  const subjects = useMemo(() => {
    const set = new Set(exams.map((e) => e.subject).filter(Boolean))
    return Array.from(set).sort()
  }, [exams])

  const grades = useMemo(() => {
    const set = new Set(exams.map((e) => e.grade.replace(/Lớp\s*/i, "").trim()).filter(Boolean))
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10)
      const numB = parseInt(b, 10)
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB
      return a.localeCompare(b)
    })
  }, [exams])

  // Filter exams globally by search and select choices
  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      const matchesSearch =
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.grade.toLowerCase().includes(searchQuery.toLowerCase())
      
      const cleanExamGrade = e.grade.replace(/Lớp\s*/i, "").trim()
      const matchesSubject = selectedSubject === "all" || e.subject === selectedSubject
      const matchesGrade = selectedGrade === "all" || cleanExamGrade === selectedGrade

      return matchesSearch && matchesSubject && matchesGrade
    })
  }, [exams, searchQuery, selectedSubject, selectedGrade])

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    } catch {
      return "---"
    }
  }

  const activeFiltersCount = (selectedSubject !== "all" ? 1 : 0) + (selectedGrade !== "all" ? 1 : 0)

  // Render Explorer Panel (Exams list + filters)
  const explorerPane = (
    <div className="flex h-full min-w-0 flex-col space-y-4">
      {/* Consolidated Action Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search exams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8.5 border-border bg-muted/10 pl-8 text-xs focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>

        {/* Filter Dialog */}
        <Dialog>
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8.5 gap-1.5 text-xs font-medium cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter
                {activeFiltersCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4.5 rounded-full px-1.5 text-xs font-bold"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md bg-popover border border-border text-popover-foreground">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Filter Exams</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Subject Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Subject</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedSubject("all")}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors focus:outline-none cursor-pointer",
                      selectedSubject === "all"
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    )}
                  >
                    All Subjects
                  </button>
                  {subjects.map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setSelectedSubject(sub)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition-colors focus:outline-none cursor-pointer",
                        selectedSubject === sub
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-card hover:bg-muted/50 text-foreground"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grade Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Grade</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedGrade("all")}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors focus:outline-none cursor-pointer",
                      selectedGrade === "all"
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    )}
                  >
                    All Grades
                  </button>
                  {grades.map((gr) => (
                    <button
                      key={gr}
                      onClick={() => setSelectedGrade(gr)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition-colors focus:outline-none cursor-pointer",
                        selectedGrade === gr
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border bg-card hover:bg-muted/50 text-foreground"
                      )}
                    >
                      Lớp {gr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4 pt-3 border-t border-border/60">
              <div className="flex w-full items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSubject("all")
                    setSelectedGrade("all")
                  }}
                  disabled={activeFiltersCount === 0}
                  className="h-8.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Reset Filters
                </Button>
                <DialogClose
                  render={
                    <Button size="sm" className="h-8.5 text-xs font-semibold cursor-pointer">
                      Apply
                    </Button>
                  }
                />
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => onEditExam(null)}
          className="h-8.5 gap-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> New File
        </Button>
        <Button
          size="sm"
          onClick={onOpenOcrTab}
          className="h-8.5 gap-1.5 text-xs font-medium"
        >
          <UploadCloud className="h-3.5 w-3.5" /> OCR PDF
        </Button>
      </div>

      {/* Database Listing Grid/Table */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-background">
        {filteredExams.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full">
            <FileText className="h-8 w-8 text-muted-foreground/50 mb-2 stroke-[1.5]" />
            <h4 className="text-xs font-semibold text-foreground">No exams found</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-[280px] leading-relaxed">
              Try adjusting your filter settings or search query, or upload a PDF to parse.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border font-semibold text-muted-foreground select-none">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Subject</th>
                <th className="px-3 py-2.5 font-medium">Grade</th>
                <th className="px-4 py-2.5 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredExams.map((exam) => {
                const isSelected = selectedExam?.id === exam.id
                return (
                  <tr
                    key={exam.id}
                    onClick={() => setSelectedExam(exam)}
                    className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                      isSelected ? "bg-secondary font-medium" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2 truncate max-w-[280px]">
                        <FileText
                          className={`h-4 w-4 shrink-0 stroke-[1.5] ${
                            isSelected ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <span className="truncate">{exam.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className="px-1.5 py-0.5 text-xs leading-none font-medium border-border/80 text-foreground/80 bg-muted/10"
                      >
                        {exam.subject}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground font-mono">
                      {exam.grade.replace(/Lớp\s*/i, "").trim()}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-muted-foreground">
                      {formatDate(exam.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  const previewPane = (
    <div className="flex h-full min-w-0 flex-col">
      {selectedExam && !isLargeScreen && (
        <button
          onClick={() => {
            setSelectedExam(null)
            setIsPreviewExpanded(false)
          }}
          className="mb-4 flex shrink-0 cursor-pointer items-center gap-1.5 self-start text-xs font-semibold text-muted-foreground hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Files
        </button>
      )}
      <ExamViewer
        key={selectedExam?.id}
        exam={selectedExam}
        onUpdateExam={onUpdateExam}
        onEditExam={onEditExam}
        onStartExam={onStartExam}
        onDeleteExam={setDeletingExamId}
        isExpanded={isPreviewExpanded}
        onToggleExpand={() => setIsPreviewExpanded(!isPreviewExpanded)}
      />
    </div>
  )

  return (
    <div className="h-full min-h-[calc(100vh-8rem)]">
      {isLargeScreen ? (
        selectedExam && isPreviewExpanded ? (
          <div className="h-full w-full">{previewPane}</div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full items-stretch"
          >
            <ResizablePanel defaultSize={55} minSize={30} maxSize={75}>
              <div className="h-full pr-3">{explorerPane}</div>
            </ResizablePanel>

            <ResizableHandle
              withHandle
              className="transition-colors hover:bg-primary/5"
            />

            <ResizablePanel defaultSize={45} minSize={25} maxSize={70}>
              <div className="h-full pl-3">{previewPane}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      ) : selectedExam ? (
        <div className="h-full w-full">{previewPane}</div>
      ) : (
        <div className="h-full w-full">{explorerPane}</div>
      )}

      {/* Delete Confirmation Dialog */}
      {examToDelete && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletingExamId(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <AlertTriangle className="size-6 text-destructive" />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete Exam</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{examToDelete.title}"? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeletingExamId(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  onDeleteExam(deletingExamId!)
                  setDeletingExamId(null)
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
