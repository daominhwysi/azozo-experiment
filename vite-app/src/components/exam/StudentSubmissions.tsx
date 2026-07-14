import { useState, useEffect } from "react"
import type { TestResult } from "@/types/exam"
import { fetchSubmissions } from "@/services/api"
import { Button } from "@/components/ui/button"
import { ChevronRight, SlidersHorizontal, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface StudentSubmissionsProps {
  onReviewSub: (sub: TestResult) => void
}

export function StudentSubmissions({ onReviewSub }: StudentSubmissionsProps) {
  const [submissions, setSubmissions] = useState<TestResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadSubmissions = async () => {
    setIsLoading(true)
    try {
      const data = await fetchSubmissions()
      setSubmissions(data)
    } catch (e) {
      console.error("Failed to load student submissions", e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSubmissions()
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Banner */}
      <div className="select-none">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          My Results History
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review your completed exam assessments, scores achieved, accuracies, and view detailed response sheets.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground opacity-75" />
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground">
            Retrieving results...
          </p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="py-12 text-center select-none">
          <SlidersHorizontal className="mx-auto h-6 w-6 stroke-[1.2] text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground/80 mt-1">No exam submissions found</p>
          <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">
            Once you start and complete an exam in the Online Exam Room, your graded paper will show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-background">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border font-semibold text-muted-foreground select-none">
                <th className="py-2.5 pl-4 font-medium">Exam Title</th>
                <th className="py-2.5 px-3 font-medium">Accuracy</th>
                <th className="py-2.5 px-3 font-medium">Score</th>
                <th className="py-2.5 px-3 font-medium">Date Submitted</th>
                <th className="py-2.5 pr-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {submissions.map((sub) => {
                const isPass = sub.score >= 5.0
                return (
                  <tr
                    key={sub.id}
                    className="transition-colors hover:bg-muted/30 even:bg-muted/10 cursor-pointer"
                    onClick={() => onReviewSub(sub)}
                  >
                    <td className="max-w-[250px] truncate py-3 pl-4 font-semibold text-foreground">
                      {sub.exam_title}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground font-mono">
                      {sub.correct_count} / {sub.total_questions}
                    </td>
                    <td className={cn("py-3 px-3 font-bold", isPass ? "text-green-600" : "text-destructive")}>
                      {sub.score.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {new Date(sub.submitted_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          onReviewSub(sub)
                        }}
                        className="h-8 gap-1 px-3 text-xs"
                      >
                        Review <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
