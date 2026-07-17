import { useState, useEffect, lazy, Suspense } from "react"
import type { Exam, TestResult } from "@/types/exam"
import { fetchExams, deleteExam, createExam, updateExam } from "@/services/api"
import { Header } from "@/components/layout/Header"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopLoader } from "@/components/ui/top-loader"
import { Loader2 } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"

// Lazy-loaded workspace components for optimized bundle size & faster initial load
const ExamBank = lazy(() =>
  import("@/components/exam/ExamBank").then((m) => ({ default: m.ExamBank }))
)
const ExamStudentRoom = lazy(() =>
  import("@/components/exam/ExamStudentRoom").then((m) => ({
    default: m.ExamStudentRoom,
  }))
)
const PdfAnnotator = lazy(() =>
  import("@/components/ocr/PdfAnnotator").then((m) => ({
    default: m.PdfAnnotator,
  }))
)
const Gradebook = lazy(() =>
  import("@/components/exam/Gradebook").then((m) => ({ default: m.Gradebook }))
)
const StudentSubmissions = lazy(() =>
  import("@/components/exam/StudentSubmissions").then((m) => ({
    default: m.StudentSubmissions,
  }))
)
const ExamEditor = lazy(() =>
  import("@/components/exam/ExamEditor").then((m) => ({
    default: m.ExamEditor,
  }))
)
const AssessmentReview = lazy(() =>
  import("@/components/exam/AssessmentReview").then((m) => ({
    default: m.AssessmentReview,
  }))
)

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<
    "bank" | "ocr" | "student" | "gradebook" | "submissions" | "review"
  >("bank")
  const [reviewSubmission, setReviewSubmission] = useState<TestResult | null>(null)
  const [reviewBackTab, setReviewBackTab] = useState<
    "bank" | "ocr" | "student" | "gradebook" | "submissions"
  >("gradebook")

  const handleTabChange = (
    tab: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  ) => {
    setActiveTab(tab)
    setReviewSubmission(null)
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

  // Editor State
  const [isEditing, setIsEditing] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)

  const loadExams = async () => {
    setIsLoadingExams(true)
    try {
      const data = await fetchExams()
      setExams(data)
      if (data.length > 0 && !selectedExam) {
        setSelectedExam(data[0])
      }
    } catch (e) {
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
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground opacity-75" />
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

      {/* Collapsible Left Sidebar */}
      {sidebarOpen && !isTestRunning && (
        <Sidebar
          activeTab={activeTab === "review" ? reviewBackTab : activeTab}
          setActiveTab={handleTabChange}
          examCount={exams.length}
          role={role}
          choiceStyle={choiceStyle}
          setChoiceStyle={handleSetChoiceStyle}
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
          className={`flex-1 overflow-y-auto bg-background ${isTestRunning && activeTab === "student" ? "p-0" : "p-6"}`}
        >
          <Suspense
            fallback={
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground opacity-75" />
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
