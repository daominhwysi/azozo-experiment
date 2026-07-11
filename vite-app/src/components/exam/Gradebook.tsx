import { useState, useEffect } from "react";
import type { TestResult } from "@/types/exam";
import { fetchSubmissions, deleteSubmission } from "@/services/api";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  BookOpen,
  User,
  Trash2,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  Layers,
  Award
} from "lucide-react";

export function Gradebook() {
  const [submissions, setSubmissions] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExamId, setSelectedExamId] = useState<string>("all");
  
  // Graded paper modal review state
  const [selectedSub, setSelectedSub] = useState<TestResult | null>(null);

  const loadSubmissions = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSubmissions();
      setSubmissions(data);
    } catch (e) {
      console.error("Failed to load submissions", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const handleDelete = async (subId: string) => {
    if (!confirm("Are you sure you want to delete this submission from the gradebook?")) return;
    try {
      await deleteSubmission(subId);
      setSubmissions((prev) => prev.filter((s) => s.id !== subId));
    } catch (e) {
      console.error(e);
      alert("Failed to delete submission.");
    }
  };

  const uniqueExams = Array.from(
    new Map(submissions.map((item) => [item.exam_id, item.exam_title])).entries()
  );

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesSearch =
      sub.exam_title.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesExam = selectedExamId === "all" || sub.exam_id === selectedExamId;

    return matchesSearch && matchesExam;
  });

  const totalCount = filteredSubmissions.length;
  const averageScore =
    totalCount > 0
      ? (filteredSubmissions.reduce((sum, item) => sum + item.score, 0) / totalCount).toFixed(2)
      : "0.00";
  const passRate =
    totalCount > 0
      ? (
          (filteredSubmissions.filter((item) => item.score >= 5.0).length / totalCount) *
          100
        ).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner section */}
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">Gradebook & Submissions</h1>
        <p className="text-xs text-muted-foreground">
          Manage all student submissions, monitor grade analytics, evaluate accuracies, and review graded papers.
        </p>
      </div>

      {/* Analytics stats row with interactive visual rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/80 shadow-xs hover:border-border hover:shadow-sm transition-all duration-200">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Submissions</p>
                <h3 className="text-lg font-bold text-foreground">{totalCount} entries</h3>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-2 py-0.5 rounded border border-border/40 shrink-0">
              Active Count
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs hover:border-border hover:shadow-sm transition-all duration-200">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Average Class Score</p>
                <h3 className="text-lg font-bold text-foreground">{averageScore} / 10.0</h3>
              </div>
            </div>
            
            {/* Visual SVG Score Ring */}
            <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="2.5" fill="transparent" className="text-muted/20" />
                <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="2.5" fill="transparent" className="text-green-500" 
                  strokeDasharray={2 * Math.PI * 16}
                  strokeDashoffset={2 * Math.PI * 16 * (1 - Math.min(10, Math.max(0, parseFloat(averageScore))) / 10)} 
                />
              </svg>
              <span className="absolute text-[8px] font-mono font-bold text-green-600">{(parseFloat(averageScore) * 10).toFixed(0)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs hover:border-border hover:shadow-sm transition-all duration-200">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Passing Rate (≥ 5.0)</p>
                <h3 className="text-lg font-bold text-foreground">{passRate}%</h3>
              </div>
            </div>

            {/* Visual SVG Pass Rate Ring */}
            <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="2.5" fill="transparent" className="text-muted/20" />
                <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="2.5" fill="transparent" className="text-amber-500" 
                  strokeDasharray={2 * Math.PI * 16}
                  strokeDashoffset={2 * Math.PI * 16 * (1 - Math.min(100, Math.max(0, parseFloat(passRate))) / 100)} 
                />
              </svg>
              <span className="absolute text-[8px] font-mono font-bold text-amber-600">{parseFloat(passRate).toFixed(0)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search actions bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by exam title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="h-9 w-full sm:w-60 text-xs px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Exams</option>
          {uniqueExams.map(([examId, examTitle]) => (
            <option key={examId} value={examId}>
              {examTitle}
            </option>
          ))}
        </select>
      </div>

      {/* Main submissions list table */}
      <Card className="border-border/80 shadow-xs">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground pl-4">Exam Title</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Accuracy</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Percentage</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Score</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Date Submitted</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    Loading submissions from the database...
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    No submissions found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubmissions.map((sub) => (
                  <TableRow key={sub.id} className="hover:bg-muted/20">
                    <TableCell className="py-3 font-semibold text-xs text-foreground pl-4 max-w-[250px] truncate" title={sub.exam_title}>
                      {sub.exam_title}
                    </TableCell>
                    <TableCell className="py-3 text-xs font-medium text-foreground">
                      {sub.correct_count} / {sub.total_questions}
                    </TableCell>
                    <TableCell className="py-3 text-xs font-medium">
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                        {sub.percentage}%
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-xs font-bold text-primary">
                      {sub.score.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground" title={sub.submitted_at}>
                      {new Date(sub.submitted_at).toLocaleString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="py-3 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelectedSub(sub)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Review graded paper"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(sub.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete submission"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Graded Paper Review Dialog */}
      {selectedSub && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedSub(null); }}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-6">
            <DialogHeader className="border-b border-border/80 pb-4 mb-4">
              <DialogTitle className="flex flex-col gap-1">
                <span className="text-lg font-bold text-foreground">Student Performance Analysis</span>
                <span className="text-xs text-muted-foreground font-normal flex flex-wrap gap-x-4 gap-y-1 items-center">
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> <strong>{selectedSub.student_name}</strong> ({selectedSub.student_code})</span>
                  <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {selectedSub.exam_title}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(selectedSub.submitted_at).toLocaleString("en-US")}</span>
                </span>
              </DialogTitle>
            </DialogHeader>

            {/* Grading result highlight header card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-muted/20 border border-border/60 p-4 rounded-xl mb-6">
              <div className="text-center p-2 border-r border-border/40 last:border-0">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Score</p>
                <p className="text-2xl font-bold text-primary mt-1">{selectedSub.score.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 border-r border-border/40 last:border-0">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Percentage</p>
                <p className="text-2xl font-bold text-foreground mt-1">{selectedSub.percentage}%</p>
              </div>
              <div className="text-center p-2 border-r border-border/40 last:border-0">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Correct Answers</p>
                <p className="text-2xl font-bold text-green-500 mt-1">{selectedSub.correct_count} / {selectedSub.total_questions}</p>
              </div>
              <div className="text-center p-2 last:border-0">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Overall Assessment</p>
                <Badge variant={selectedSub.score >= 5.0 ? "default" : "destructive"} className="mt-2 text-xs py-0.5 px-2">
                  {selectedSub.score >= 5.0 ? "PASS" : "FAIL"}
                </Badge>
              </div>
            </div>

            {/* Scrollable Questions list with student answers marked */}
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2">
                <Layers className="h-4 w-4" /> Question Breakdown Analysis
              </h3>

              <div className="space-y-4">
                {selectedSub.detailed_results.map((res, index) => {
                  const isCorrect = res.is_correct;
                  return (
                    <Card key={res.question_id || index} className={`border border-border/80 ${isCorrect ? "bg-green-500/2" : "bg-destructive/2"}`}>
                      <CardContent className="p-4 space-y-3">
                        {/* Status bar */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-primary">{res.question_number}</span>
                          <span className="flex items-center gap-1 text-xs">
                            {isCorrect ? (
                              <span className="text-green-600 flex items-center gap-1 font-semibold">
                                <CheckCircle className="h-3.5 w-3.5" /> Correct
                              </span>
                            ) : (
                              <span className="text-destructive flex items-center gap-1 font-semibold">
                                <XCircle className="h-3.5 w-3.5" /> Incorrect
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Stimulus read */}
                        {res.stimulus_text && (
                          <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-xs text-muted-foreground italic mb-2 leading-relaxed">
                            {res.stimulus_text}
                          </div>
                        )}

                        {/* Stem */}
                        <p className="text-xs font-medium text-foreground leading-relaxed">
                          {res.stem}
                        </p>

                        {/* Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 pl-2">
                          {res.options.map((opt) => {
                            const isStudentSel = opt.label === res.student_answer;
                            const isCorrectAns = opt.label === res.correct_answer;

                            let optStyle = "border-border/60 text-muted-foreground bg-card";
                            if (isCorrectAns) {
                              optStyle = "border-green-500/80 bg-green-500/10 text-green-700 font-medium";
                            } else if (isStudentSel && !isCorrect) {
                              optStyle = "border-destructive/80 bg-destructive/10 text-destructive font-medium";
                            }

                            return (
                              <div
                                key={opt.label}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${optStyle}`}
                              >
                                <span className="font-bold">{opt.label}.</span>
                                <span>{opt.text}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation & Info */}
                        <div className="p-3 bg-muted/20 border border-border/50 rounded-lg space-y-1.5 text-xs text-muted-foreground">
                          <p>
                            👉 <strong>Student's Answer:</strong>{" "}
                            <span className={isCorrect ? "text-green-600 font-bold" : "text-destructive font-bold"}>
                              {res.student_answer || "Not selected"}
                            </span>
                            {" | "}
                            <strong>Correct Answer:</strong>{" "}
                            <span className="text-green-600 font-bold">{res.correct_answer}</span>
                          </p>
                          {res.explanation && (
                            <p className="leading-relaxed border-t border-border/30 pt-1.5 mt-1.5">
                              <strong>💡 Explanation:</strong> {res.explanation}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
