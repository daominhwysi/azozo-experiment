import { useState, useEffect } from "react";
import type { Exam } from "@/types/exam";
import { fetchExams, deleteExam } from "@/services/api";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ExamBank } from "@/components/exam/ExamBank";
import { ExamStudentRoom } from "@/components/exam/ExamStudentRoom";
import { PdfAnnotator } from "@/components/ocr/PdfAnnotator";
import { TopLoader } from "@/components/ui/top-loader";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"bank" | "ocr" | "student">("bank");

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [isLoadingExams, setIsLoadingExams] = useState(false);

  const loadExams = async () => {
    setIsLoadingExams(true);
    try {
      const data = await fetchExams();
      setExams(data);
      if (data.length > 0 && !selectedExam) {
        setSelectedExam(data[0]);
      }
    } catch (e) {
      console.warn("Backend API offline or unreachable", e);
    } finally {
      setIsLoadingExams(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const handleStartExam = (exam: Exam) => {
    setSelectedExam(exam);
    setActiveTab("student");
  };

  const handleDeleteExam = async (examId: string) => {
    try {
      await deleteExam(examId);
      setExams((prev) => {
        const updated = prev.filter((e) => e.id !== examId);
        if (selectedExam?.id === examId) {
          setSelectedExam(updated[0] || null);
        }
        return updated;
      });
    } catch (e) {
      console.error("Failed to delete exam", e);
    }
  };

  return (
    <div className="h-screen bg-background text-foreground font-sans flex overflow-hidden">
      {/* Top Global Progress Bar */}
      <TopLoader />

      {/* Collapsible Left Sidebar */}
      {sidebarOpen && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          examCount={exams.length}
        />
      )}

      {/* Main Container Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Navigation Bar */}
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeTab={activeTab}
          onRefresh={loadExams}
          isLoading={isLoadingExams}
        />

        {/* Central Workspace Canvas */}
        <main className="flex-1 p-6 overflow-y-auto bg-background">
          {activeTab === "bank" && (
            <ExamBank
              exams={exams}
              selectedExam={selectedExam}
              setSelectedExam={setSelectedExam}
              onOpenOcrTab={() => setActiveTab("ocr")}
              onStartExam={handleStartExam}
              onDeleteExam={handleDeleteExam}
            />
          )}

          {activeTab === "ocr" && (
            <PdfAnnotator
              onExamCreated={() => {
                loadExams();
                setActiveTab("bank");
              }}
            />
          )}

          {activeTab === "student" && (
            <ExamStudentRoom
              exams={exams}
              selectedExam={selectedExam}
              onSelectExam={setSelectedExam}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
