import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import type { Exam, TestResult } from "@/types/exam"
import { submitExam } from "@/services/api"
import { groupBySection } from "@/lib/markdown"
import { ExamStudentRoomHeader } from "./ExamStudentRoomHeader"
import { ExamStudentRoomBottomBar } from "./ExamStudentRoomBottomBar"
import { ExamStudentRoomQuestionGrid } from "./ExamStudentRoomQuestionGrid"
import { ExamStudentRoomStartCard } from "./ExamStudentRoomStartCard"
import { ExamStudentRoomResultsSummary } from "./ExamStudentRoomResultsSummary"
import { ExamStudentRoomFullResultsView } from "./ExamStudentRoomFullResultsView"
import { AllQuestionsTakingView } from "./AllQuestionsTakingView"
import { SingleQuestionTakingView } from "./SingleQuestionTakingView"
import { SingleQuestionResultsView } from "./SingleQuestionResultsView"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ExamStudentRoomProps {
  exams: Exam[]
  selectedExam: Exam | null
  onSelectExam?: (exam: Exam) => void
  isTestRunning: boolean
  setIsTestRunning: (running: boolean) => void
  onBack?: () => void
  choiceStyle: "radio" | "abcd"
  setChoiceStyle: (style: "radio" | "abcd") => void
}

export function ExamStudentRoom({
  exams,
  selectedExam,
  onSelectExam,
  isTestRunning,
  setIsTestRunning,
  onBack,
  choiceStyle,
  setChoiceStyle,
}: ExamStudentRoomProps) {
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({})
  const studentName = "John Doe"
  const [timeRemaining, setTimeRemaining] = useState<number>(45 * 60)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(0)
  const [activeSectionIdx, setActiveSectionIdx] = useState<number>(0)
  const [viewMode, setViewMode] = useState<"full" | "single">("full")
  const [showQuestionGrid, setShowQuestionGrid] = useState(false)
  const [showQuestionNumbers, setShowQuestionNumbers] = useState(true)
  const isAutoScrollingRef = useRef(false)

  const activeExam = selectedExam || (exams.length > 0 ? exams[0] : null)

  const questions = useMemo(() => {
    const rawQuestions = activeExam?.questions || []
    return Array.from(new Map(rawQuestions.map((q) => [q.id, q])).values())
  }, [activeExam])

  const sectionGroups = useMemo(() => groupBySection(questions), [questions])

  const hasSections = useMemo(
    () => questions.some((q) => q.section && q.section.trim().length > 0),
    [questions]
  )

  useEffect(() => {
    const sectionIndex = sectionGroups.findIndex((group) =>
      group.questions.some((q) => q.globalIndex === activeQuestionIdx)
    )
    if (sectionIndex !== -1 && sectionIndex !== activeSectionIdx) {
      setActiveSectionIdx(sectionIndex)
    }
  }, [activeQuestionIdx, sectionGroups, activeSectionIdx])

  useEffect(() => {
    if (activeExam && isTestRunning) {
      try {
        const saved = localStorage.getItem(`azozo_draft_${activeExam.id}`)
        if (saved) setStudentAnswers(JSON.parse(saved))
      } catch (e) {
        console.warn("Failed to restore draft from localStorage", e)
      }
    }
  }, [activeExam?.id, isTestRunning])

  useEffect(() => {
    if (activeExam && isTestRunning && Object.keys(studentAnswers).length > 0) {
      localStorage.setItem(
        `azozo_draft_${activeExam.id}`,
        JSON.stringify(studentAnswers)
      )
    }
  }, [studentAnswers, activeExam?.id, isTestRunning])

  useEffect(() => {
    if (questions.length === 0 || testResult || viewMode === "single") return

    const scrollContainer = document.querySelector("main")
    const observer = new IntersectionObserver(
      (entries) => {
        if (isAutoScrollingRef.current) return
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const match = entry.target.id.match(/question-(\d+)/)
            if (match) setActiveQuestionIdx(parseInt(match[1], 10))
          }
        })
      },
      { root: scrollContainer, rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    )

    questions.forEach((_, idx) => {
      const el = document.getElementById(`question-${idx}`)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [questions, testResult, viewMode])

  useEffect(() => {
    const activeBtn = document.getElementById(`nav-question-${activeQuestionIdx}`)
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" })
    }
  }, [activeQuestionIdx])

  const handleStartTest = () => {
    if (!activeExam) return
    setStudentAnswers({})
    setTestResult(null)
    setActiveQuestionIdx(0)
    setTimeRemaining((activeExam.duration_minutes || 45) * 60)
    setIsTestRunning(true)
  }

  const handleSelectOption = useCallback(
    (qId: string, label: string) => {
      if (!isTestRunning) return
      setStudentAnswers((prev) => ({ ...prev, [qId]: label }))
    },
    [isTestRunning]
  )

  const handleCompleteExam = async () => {
    if (!activeExam || isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await submitExam(activeExam.id, studentName, studentAnswers)
      setTestResult(res)
      setIsTestRunning(false)
      localStorage.removeItem(`azozo_draft_${activeExam.id}`)
    } catch (e) {
      console.error(e)
      alert("An error occurred while submitting the test!")
    } finally {
      setIsSubmitting(false)
    }
  }

  const completeExamRef = useRef(handleCompleteExam)

  useEffect(() => {
    completeExamRef.current = handleCompleteExam
  })

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (isTestRunning && timeRemaining > 0) {
      interval = setInterval(() => setTimeRemaining((prev) => prev - 1), 1000)
    } else if (timeRemaining === 0 && isTestRunning) {
      completeExamRef.current()
    }
    return () => { if (interval) clearInterval(interval) }
  }, [isTestRunning, timeRemaining])

  const handleCopyAnswerSheet = () => {
    if (!testResult) return
    let text = `EXAM RESULTS: ${testResult.exam_title}\n`
    text += `Student: ${testResult.student_name}\n`
    text += `Score: ${testResult.score}/10 (${testResult.correct_count}/${testResult.total_questions} correct)\n`
    text += `Accuracy rate: ${testResult.percentage}%\n\n`
    text += `GRADED BREAKDOWN:\n`
    testResult.detailed_results.forEach((res, idx) => {
      const isCorrect = res.is_correct ? "CORRECT" : "INCORRECT"
      const studentAns = res.student_answer || "No response"
      const correctAns = res.correct_answer
      text += `Question ${idx + 1}: Selected ${studentAns} - ${isCorrect}`
      if (!res.is_correct) text += ` (Correct answer: ${correctAns})`
      text += `\n`
    })
    navigator.clipboard
      .writeText(text)
      .then(() => alert("Copied graded results to clipboard!"))
      .catch((err) => console.error("Failed to copy:", err))
  }

  if (!activeExam) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        No exams found in the catalog.
      </div>
    )
  }

  const isSingleMode = viewMode === "single" && (isTestRunning || !!testResult)

  return (
    <div
      className={`relative flex w-full flex-col bg-background ${
        isSingleMode ? "h-screen overflow-hidden" : "min-h-screen pb-32"
      }`}
    >
      {(isTestRunning || !!testResult) && (
        <ExamStudentRoomHeader
          onBack={onBack}
          activeExam={activeExam}
          isTestRunning={isTestRunning}
          setIsTestRunning={setIsTestRunning}
          testResult={testResult}
          viewMode={viewMode}
          setViewMode={setViewMode}
          activeQuestionIdx={activeQuestionIdx}
          questions={questions}
          timeRemaining={timeRemaining}
          isSubmitting={isSubmitting}
          handleCompleteExam={handleCompleteExam}
          handleStartTest={handleStartTest}
          handleCopyAnswerSheet={handleCopyAnswerSheet}
          choiceStyle={choiceStyle}
          setChoiceStyle={setChoiceStyle}
        />
      )}

      <div
        className={`flex min-h-0 w-full flex-1 flex-col ${
          isSingleMode
            ? isTestRunning
              ? "max-w-none overflow-hidden p-0"
              : "mx-auto max-w-7xl overflow-hidden p-0"
            : isTestRunning
              ? "max-w-none px-6 py-6 pb-32"
              : testResult
                ? "mx-auto mt-6 max-w-7xl px-4 pb-32"
                : "mx-auto mt-6 max-w-3xl px-4 pb-12"
        }`}
      >
        {/* Start Exam Card */}
        {!isTestRunning && !testResult && (
          <ExamStudentRoomStartCard
            activeExam={activeExam}
            questionsLength={questions.length}
            exams={exams}
            onSelectExam={onSelectExam}
            handleStartTest={handleStartTest}
            onBack={onBack}
          />
        )}

        {/* Test Results */}
        {testResult && (
          <div className={isSingleMode ? "flex min-h-0 w-full flex-1 flex-col" : "space-y-6"}>
            {!isSingleMode && <ExamStudentRoomResultsSummary testResult={testResult} />}

            <div className={isSingleMode ? "flex min-h-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-5xl"}>
              {isSingleMode ? (
                <SingleQuestionResultsView
                  result={testResult.detailed_results[activeQuestionIdx]}
                  index={activeQuestionIdx}
                  totalQuestions={testResult.detailed_results.length}
                  choiceStyle={choiceStyle}
                />
              ) : (
                <ExamStudentRoomFullResultsView
                  detailedResults={testResult.detailed_results}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  singleView={null}
                  choiceStyle={choiceStyle}
                />
              )}
            </div>
          </div>
        )}

        {/* Questions View */}
        {!testResult && (
          <div className={isSingleMode ? "flex min-h-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-5xl"}>
            <div className={isSingleMode ? "flex min-h-0 w-full flex-1 flex-col" : isTestRunning ? "space-y-4" : "space-y-4 rounded-xl border border-border bg-card p-6 shadow-xs md:p-8"}>
              {!isTestRunning && (
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h2 className="text-sm font-bold text-foreground">Exam Questions</h2>
                  <Select
                    value={viewMode}
                    onValueChange={(val) => setViewMode(val as "full" | "single")}
                  >
                    <SelectTrigger className="text-xs w-36 bg-background dark:bg-card text-foreground">
                      <SelectValue placeholder="View mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">All Questions</SelectItem>
                      <SelectItem value="single">One by One</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {questions.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-xs text-muted-foreground">
                  The selected exam does not contain any questions.
                </div>
              ) : viewMode === "full" ? (
                <AllQuestionsTakingView
                  questions={questions}
                  studentAnswers={studentAnswers}
                  isTestRunning={isTestRunning}
                  onSelectOption={handleSelectOption}
                  choiceStyle={choiceStyle}
                />
              ) : (
                <SingleQuestionTakingView
                  question={questions[activeQuestionIdx]}
                  index={activeQuestionIdx}
                  totalQuestions={questions.length}
                  studentAnswers={studentAnswers}
                  isTestRunning={isTestRunning}
                  onSelectOption={handleSelectOption}
                  choiceStyle={choiceStyle}
                />
              )}
            </div>
          </div>
        )}

        {/* Bottom Navigation Bar */}
        <ExamStudentRoomBottomBar
          testResult={testResult}
          isTestRunning={isTestRunning}
          isSingleMode={isSingleMode}
          questions={questions}
          sectionGroups={sectionGroups}
          hasSections={hasSections}
          activeSectionIdx={activeSectionIdx}
          activeQuestionIdx={activeQuestionIdx}
          studentAnswers={studentAnswers}
          viewMode={viewMode}
          showQuestionNumbers={showQuestionNumbers}
          showQuestionGrid={showQuestionGrid}
          setShowQuestionGrid={setShowQuestionGrid}
          setShowQuestionNumbers={setShowQuestionNumbers}
          setActiveQuestionIdx={setActiveQuestionIdx}
          setActiveSectionIdx={setActiveSectionIdx}
          onBack={onBack}
        />

        {/* Question Grid */}
        {showQuestionGrid && (
          <ExamStudentRoomQuestionGrid
            testResult={testResult}
            questions={questions}
            sectionGroups={sectionGroups}
            activeQuestionIdx={activeQuestionIdx}
            studentAnswers={studentAnswers}
            onClose={() => setShowQuestionGrid(false)}
            onSelectQuestion={(idx) => {
              setActiveQuestionIdx(idx)
              if (viewMode === "full") {
                const prefix = testResult ? "review-question-" : "question-"
                const el = document.getElementById(prefix + idx)
                if (el) el.scrollIntoView({ behavior: "auto", block: "center" })
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
