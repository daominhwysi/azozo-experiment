import { useState, useMemo, useEffect } from "react"
import type { TestResult, Exam } from "@/types/exam"
import { fetchSubmissions, deleteSubmission, fetchExams } from "@/services/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Trash2,
  TrendingUp,
  FileSpreadsheet,
  Eye,
  Award,
} from "lucide-react"

interface GradebookProps {
  onReviewSub: (sub: TestResult) => void
}

export function Gradebook({ onReviewSub }: GradebookProps) {
  const [submissions, setSubmissions] = useState<TestResult[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedExamId, setSelectedExamId] = useState<string>("all")

  const loadSubmissions = async () => {
    setIsLoading(true)
    try {
      const [submissionsData, examsData] = await Promise.all([
        fetchSubmissions(),
        fetchExams()
      ])
      setSubmissions(submissionsData)
      setExams(examsData)
    } catch (e) {
      console.error("Failed to load submissions", e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSubmissions()
  }, [])

  const examsMap = useMemo(() => {
    const map = new Map<string, Exam>()
    exams.forEach((exam) => {
      map.set(exam.id, exam)
    })
    return map
  }, [exams])

  const handleDelete = async (subId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this submission from the gradebook?"
      )
    )
      return
    try {
      await deleteSubmission(subId)
      setSubmissions((prev) => prev.filter((s) => s.id !== subId))
    } catch (e) {
      console.error(e)
      alert("Failed to delete submission.")
    }
  }

  const uniqueExams = Array.from(
    new Map(
      submissions.map((item) => [item.exam_id, item.exam_title])
    ).entries()
  )

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesSearch = sub.exam_title
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const matchesExam =
      selectedExamId === "all" || sub.exam_id === selectedExamId

    return matchesSearch && matchesExam
  })

  const totalCount = filteredSubmissions.length
  const averageScore =
    totalCount > 0
      ? (
          filteredSubmissions.reduce((sum, item) => sum + item.score, 0) /
          totalCount
        ).toFixed(2)
      : "0.00"
  const passRate =
    totalCount > 0
      ? (
          (filteredSubmissions.filter((item) => item.score >= 5.0).length /
            totalCount) *
          100
        ).toFixed(1)
      : "0.0"

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Banner section */}
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Gradebook Ledger
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage all student submissions, monitor grade analytics, evaluate
          accuracies, and review graded papers.
        </p>
      </div>

      {/* Analytics stats row */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <Card className="border-border shadow-none">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <FileSpreadsheet className="h-4.5 w-4.5 stroke-[1.5]" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground font-medium">
                Total submissions
              </span>
              <h3 className="mt-0.5 text-base font-bold text-foreground">
                {totalCount}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-4.5 w-4.5 stroke-[1.5]" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground font-medium">
                Average class score
              </span>
              <h3 className="mt-0.5 text-base font-bold text-foreground">
                {averageScore} <span className="text-xs font-normal text-muted-foreground">/ 10.0</span>
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
              <Award className="h-4.5 w-4.5 stroke-[1.5]" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground font-medium">
                Passing rate
              </span>
              <h3 className="mt-0.5 text-base font-bold text-foreground">
                {passRate}% <span className="text-xs font-normal text-muted-foreground">(&ge; 5.0)</span>
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search actions bar */}
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <div className="relative w-full flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by exam title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 text-xs"
          />
        </div>

        <Select value={selectedExamId} onValueChange={(val) => setSelectedExamId(val || "all")}>
          <SelectTrigger className="h-9 w-full sm:w-60 text-xs bg-card border-border">
            <SelectValue placeholder="All Exams" />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border text-popover-foreground">
            <SelectItem value="all">All Exams</SelectItem>
            {uniqueExams.map(([examId, examTitle]) => (
              <SelectItem key={examId} value={examId}>
                {examTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main submissions list table */}
      <div className="overflow-x-auto rounded-lg bg-background">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border font-semibold text-muted-foreground select-none">
              <th className="py-2.5 pl-4 font-medium">Exam Title</th>
              <th className="py-2.5 px-3 font-medium">Duration</th>
              <th className="py-2.5 px-3 font-medium">Score</th>
              <th className="py-2.5 px-3 font-medium">Date Submitted</th>
              <th className="py-2.5 pr-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  Loading submissions from the database...
                </td>
              </tr>
            ) : filteredSubmissions.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  No submissions found.
                </td>
              </tr>
            ) : (
              filteredSubmissions.map((sub) => {
                const exam = examsMap.get(sub.exam_id)
                return (
                  <tr
                    key={sub.id}
                    className="transition-colors hover:bg-muted/30 even:bg-muted/10"
                  >
                    <td
                      className="max-w-[250px] truncate py-3 pl-4 font-semibold text-foreground"
                      title={sub.exam_title}
                    >
                      {sub.exam_title}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground font-mono">
                      {exam ? `${exam.duration_minutes}m` : "---"}
                    </td>
                    <td className="py-3 px-3 font-bold text-primary">
                      {sub.score.toFixed(2)}
                    </td>
                    <td
                      className="py-3 px-3 text-muted-foreground"
                      title={sub.submitted_at}
                    >
                      {new Date(sub.submitted_at).toLocaleString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onReviewSub(sub)}
                          className="h-9 w-9 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Review graded paper"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(sub.id)}
                          className="h-9 w-9 sm:h-7 sm:w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                          title="Delete submission"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


