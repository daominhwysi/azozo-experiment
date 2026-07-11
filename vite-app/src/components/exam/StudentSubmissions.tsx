import { useState, useEffect } from "react";
import type { TestResult } from "@/types/exam";
import { fetchSubmissions } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  Layers,
  ChevronRight
} from "lucide-react";

export function StudentSubmissions() {
  const [submissions, setSubmissions] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSub, setSelectedSub] = useState<TestResult | null>(null);

  const loadSubmissions = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSubmissions();
      setSubmissions(data);
    } catch (e) {
      console.error("Failed to load student submissions", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Banner */}
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">Student Assessment History</h1>
        <p className="text-xs text-muted-foreground">
          Review your completed assessments, scores achieved, accuracy rates, and view detailed response sheets.
        </p>
      </div>

      {/* Submissions list */}
      <Card className="border-border/80 shadow-xs">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground pl-4">Completed Exam Title</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Accuracy</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Percentage</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Score</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground">Date Submitted</TableHead>
                <TableHead className="text-xs font-bold py-3 text-muted-foreground text-right pr-4">Graded Paper</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    Retrieving history...
                  </TableCell>
                </TableRow>
              ) : submissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    No assessment history records found.
                  </TableCell>
                </TableRow>
              ) : (
                submissions.map((sub) => (
                  <TableRow key={sub.id} className="hover:bg-muted/20">
                    <TableCell className="py-3 text-xs font-semibold text-foreground pl-4">
                      {sub.exam_title}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">
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
                    <TableCell className="py-3 text-xs text-muted-foreground">
                      {new Date(sub.submitted_at).toLocaleString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      })}
                    </TableCell>
                    <TableCell className="py-3 text-right pr-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedSub(sub)}
                        className="h-7 text-[10px] px-2.5 gap-1"
                      >
                        Details <ChevronRight className="h-3 w-3" />
                      </Button>
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
                <span className="text-lg font-bold text-foreground">Assessment Review</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Exam: <strong>{selectedSub.exam_title}</strong> | Student: <strong>{selectedSub.student_name}</strong>
                </span>
              </DialogTitle>
            </DialogHeader>

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

            <div className="space-y-6">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2">
                <Layers className="h-4 w-4" /> Performance Breakdown
              </h3>

              <div className="space-y-4">
                {selectedSub.detailed_results.map((res, index) => {
                  const isCorrect = res.is_correct;
                  return (
                    <Card key={res.question_id || index} className={`border border-border/80 ${isCorrect ? "bg-green-500/2" : "bg-destructive/2"}`}>
                      <CardContent className="p-4 space-y-3">
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

                        {res.stimulus_text && (
                          <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-xs text-muted-foreground italic mb-2 leading-relaxed">
                            {res.stimulus_text}
                          </div>
                        )}

                        <p className="text-xs font-medium text-foreground leading-relaxed">
                          {res.stem}
                        </p>

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

                        <div className="p-3 bg-muted/20 border border-border/50 rounded-lg space-y-1.5 text-xs text-muted-foreground">
                          <p>
                            👉 <strong>Your Selection:</strong>{" "}
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
