import { useState, useEffect, lazy, Suspense } from "react"
import type { Exam, TestResult } from "@/types/exam"
import { fetchExams, deleteExam, createExam, updateExam } from "@/services/api"
import { Header } from "@/layouts/Header"
import { Sidebar } from "@/layouts/Sidebar"
import { useIsMobile } from "@/hooks/use-mobile"
import { TopLoader } from "@/components/ui/top-loader"
import { Loader2 } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"

// Lazy-loaded workspace components for optimized bundle size & faster initial load
const ExamBank = lazy(() =>
  import("@/features/exam/ExamBank").then((m) => ({ default: m.ExamBank }))
)
const ExamStudentRoom = lazy(() =>
  import("@/features/exam/ExamStudentRoom").then((m) => ({
    default: m.ExamStudentRoom,
  }))
)
const PdfAnnotator = lazy(() =>
  import("@/features/ocr/PdfAnnotator").then((m) => ({
    default: m.PdfAnnotator,
  }))
)
const Gradebook = lazy(() =>
  import("@/features/exam/Gradebook").then((m) => ({ default: m.Gradebook }))
)
const StudentSubmissions = lazy(() =>
  import("@/features/exam/StudentSubmissions").then((m) => ({
    default: m.StudentSubmissions,
  }))
)
const ExamEditor = lazy(() =>
  import("@/features/exam/ExamEditor").then((m) => ({
    default: m.ExamEditor,
  }))
)
const AssessmentReview = lazy(() =>
  import("@/features/exam/AssessmentReview").then((m) => ({
    default: m.AssessmentReview,
  }))
)

export function App() {
  const isMobile = useIsMobile()
  // Open by default on desktop, closed on phones where it would eat the viewport.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile)
  const [activeTab, setActiveTab] = useState<
    "bank" | "ocr" | "student" | "gradebook" | "submissions" | "review"
  >("bank")
  const [reviewSubmission, setReviewSubmission] = useState<TestResult | null>(null)
  const [reviewBackTab, setReviewBackTab] = useState<
    "bank" | "ocr" | "student" | "gradebook" | "submissions"
  >("gradebook")

  // Follow the breakpoint when it changes, so a resize never strands the drawer open.
  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  const handleTabChange = (
    tab: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  ) => {
    setActiveTab(tab)
    setReviewSubmission(null)
    // A drawer must get out of the way once it has been used.
    if (isMobile) setSidebarOpen(false)
  }
  const [role, setRole] = useState<"teacher" | "student">("teacher")
  const [isTestRunning, setIsTestRunning] = useState(false)
  const [choiceStyle, setChoiceStyle] = useState<"radio" | "abcd">(() => {
    return (localStorage.getItem("azozo_choice_style") as "radio" | "abcd") || "radio"
  })

  const handleSetChoiceStyle = (style: "radio" | "abcd") => {
    setChoiceStyle(style)
    localStorage.setItem("azozo_choice_style", style)
  }

  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [isLoadingExams, setIsLoadingExams] = useState(false)
  const [serverStatus, setServerStatus] = useState<
    "connecting" | "online" | "offline"
  >("connecting")

  // Editor State
  const [isEditing, setIsEditing] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)

  const loadExams = async () => {
    setIsLoadingExams(true)
    try {
      const data = await fetchExams()
      setExams(data)
      setServerStatus("online")
      if (data.length > 0 && !selectedExam) {
        setSelectedExam(data[0])
      }
    } catch (e) {
      setServerStatus("offline")
      console.warn("Backend API offline or unreachable", e)
    } finally {
      setIsLoadingExams(false)
    }
  }

  useEffect(() => {
    loadExams()
  }, [])

  const handleStartExam = (exam: Exam) => {
    setSelectedExam(exam)
    setActiveTab("student")
  }

  const handleDeleteExam = async (examId: string) => {
    try {
      await deleteExam(examId)
      setExams((prev) => {
        const updated = prev.filter((e) => e.id !== examId)
        if (selectedExam?.id === examId) {
          setSelectedExam(updated[0] || null)
        }
        return updated
      })
    } catch (e) {
      console.error("Failed to delete exam", e)
    }
  }

  const handleUpdateExam = (updatedExam: Exam) => {
    setExams((prev) =>
      prev.map((e) => (e.id === updatedExam.id ? updatedExam : e))
    )
    setSelectedExam(updatedExam)
  }

  const handleEditExam = (exam: Exam | null) => {
    setEditingExam(exam)
    setIsEditing(true)
  }

  const handleSaveExam = async (examData: Omit<Exam, "id" | "created_at">) => {
    try {
      if (editingExam) {
        const updated = await updateExam(editingExam.id, examData)
        setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        setSelectedExam(updated)
      } else {
        const created = await createExam(examData)
        setExams((prev) => [created, ...prev])
        setSelectedExam(created)
      }
      setIsEditing(false)
      setEditingExam(null)
      setActiveTab("bank")
    } catch (e) {
      console.error("Failed to save exam", e)
      throw e
    }
  }

  if (isEditing) {
    return (
      <div className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
        <TopLoader />
        <main className="flex h-full flex-1 flex-col overflow-hidden bg-background">
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2"
              >
                <Loader2
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin text-muted-foreground opacity-75"
                />
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground">
                  Loading workspace...
                </p>
              </div>
            }
          >
            <ExamEditor
              exam={editingExam}
              onSave={handleSaveExam}
              onCancel={() => {
                setIsEditing(false)
                setEditingExam(null)
              }}
            />
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Top Global Progress Bar */}
      <TopLoader />
      <Toaster />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-foreground"
      >
        Skip to content
      </a>

      {/* Collapsible Left Sidebar */}
      {sidebarOpen && !isTestRunning && (
        <Sidebar
          activeTab={activeTab === "review" ? reviewBackTab : activeTab}
          setActiveTab={handleTabChange}
          examCount={exams.length}
          role={role}
          choiceStyle={choiceStyle}
          setChoiceStyle={handleSetChoiceStyle}
          serverStatus={serverStatus}
          isMobile={isMobile}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Container Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Navigation Bar */}
        {!isTestRunning && (
          <Header
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            activeTab={activeTab === "review" ? reviewBackTab : activeTab}
            onRefresh={loadExams}
            isLoading={isLoadingExams}
            role={role}
            setRole={setRole}
            setActiveTab={handleTabChange}
          />
        )}

        {/* Central Workspace Canvas */}
        <main
          id="main-content"
          aria-label="Workspace content"
          className={`flex-1 overflow-y-auto bg-background ${isTestRunning && activeTab === "student" ? "p-0" : "p-4 md:p-6"}`}
        >
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2"
              >
                <Loader2
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin text-muted-foreground opacity-75"
                />
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground">
                  Loading workspace...
                </p>
              </div>
            }
          >
            <>
              {activeTab === "bank" && (
                <ExamBank
                  exams={exams}
                  selectedExam={selectedExam}
                  setSelectedExam={setSelectedExam}
                  onOpenOcrTab={() => setActiveTab("ocr")}
                  onStartExam={handleStartExam}
                  onDeleteExam={handleDeleteExam}
                  onUpdateExam={handleUpdateExam}
                  onEditExam={handleEditExam}
                />
              )}

              {activeTab === "ocr" && (
                <PdfAnnotator
                  onExamCreated={() => {
                    loadExams()
                    setActiveTab("bank")
                  }}
                  onCreateExamFromScratch={() => handleEditExam(null)}
                />
              )}

              {activeTab === "gradebook" && (
                <Gradebook
                  onReviewSub={(sub) => {
                    setReviewSubmission(sub)
                    setReviewBackTab("gradebook")
                    setActiveTab("review")
                  }}
                />
              )}

              {activeTab === "student" && (
                <ExamStudentRoom
                  exams={exams}
                  selectedExam={selectedExam}
                  onSelectExam={setSelectedExam}
                  isTestRunning={isTestRunning}
                  setIsTestRunning={setIsTestRunning}
                  onBack={() => setActiveTab("bank")}
                  choiceStyle={choiceStyle}
                  setChoiceStyle={handleSetChoiceStyle}
                />
              )}

              {activeTab === "submissions" && (
                <StudentSubmissions
                  onReviewSub={(sub) => {
                    setReviewSubmission(sub)
                    setReviewBackTab("submissions")
                    setActiveTab("review")
                  }}
                />
              )}

              {activeTab === "review" && reviewSubmission && (
                <AssessmentReview
                  result={reviewSubmission}
                  onBack={() => {
                    setActiveTab(reviewBackTab)
                    setReviewSubmission(null)
                  }}
                  choiceStyle={choiceStyle}
                />
              )}
            </>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default App
