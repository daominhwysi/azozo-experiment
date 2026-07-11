import { useState, useEffect } from "react";
import { 
  createOcrTask, 
  fetchOcrTasks, 
  deleteOcrTask, 
  fetchOcrTask, 
  createExam
} from "@/services/api";
import type { OcrTask } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QuestionPreviewCard } from "./QuestionPreviewCard";
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
  Eye, 
  EyeOff 
} from "lucide-react";

interface PdfAnnotatorProps {
  onExamCreated: () => void;
}

export function PdfAnnotator({ onExamCreated }: PdfAnnotatorProps) {
  const [activeInputTab, setActiveInputTab] = useState<"file" | "text">("file");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [addToBank, setAddToBank] = useState(true);
  const [examTitleInput, setExamTitleInput] = useState("Trial Graduation Assessment 2026");
  const [examSubjectInput, setExamSubjectInput] = useState("Mathematics");
  const [examGradeInput, setExamGradeInput] = useState("Grade 12");
  const [examDurationInput, setExamDurationInput] = useState(45);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  
  // OCR Background Tasks state
  const [tasks, setTasks] = useState<OcrTask[]>([]);

  // Active review output state
  const [importedQuestions, setImportedQuestions] = useState<any[]>([]);
  const [importedRawText, setImportedRawText] = useState("");
  const [showRawText, setShowRawText] = useState(false);
  const [isSavingToBank, setIsSavingToBank] = useState(false);

  // Poll tasks statuses periodically
  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => {
      pollRunningTasks();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const loadTasks = async () => {
    try {
      const activeTasks = await fetchOcrTasks();
      setTasks(activeTasks);
    } catch (e) {
      console.error("Failed to load OCR tasks", e);
    }
  };

  const pollRunningTasks = async () => {
    try {
      const activeTasks = await fetchOcrTasks();
      // Check if any task has changed state to trigger user alerts
      setTasks((prev) => {
        activeTasks.forEach((task) => {
          const matchingPrev = prev.find((t) => t.id === task.id);
          if (matchingPrev && matchingPrev.status !== task.status) {
            if (task.status === "completed") {
              if (task.add_to_bank) {
                alert(`🎉 Task "${task.filename || "Raw Text"}" completed successfully and auto-saved to the Exam Bank!`);
                onExamCreated();
              } else {
                alert(`🎉 Task "${task.filename || "Raw Text"}" completed! Results are displayed on the right pane.`);
              }
              handleViewTaskResult(task.id);
            } else if (task.status === "failed") {
              alert(`❌ Task "${task.filename || "Raw Text"}" failed: ${task.error || "Unknown error"}`);
            }
          }
        });
        return activeTasks;
      });
    } catch (e) {
      console.warn("Poll tasks failed: backend offline", e);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!examTitleInput || examTitleInput === "Trial Graduation Assessment 2026") {
        const cleanName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
        setExamTitleInput(cleanName);
      }
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setPdfFile(file);
      } else {
        alert("Please select a valid PDF file (.pdf)");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!examTitleInput || examTitleInput === "Trial Graduation Assessment 2026") {
        const cleanName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
        setExamTitleInput(cleanName);
      }
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setPdfFile(file);
      } else {
        alert("Please select a valid PDF file (.pdf)");
      }
    }
  };

  const handleStartOcr = async () => {
    if (activeInputTab === "file" && !pdfFile) {
      alert("Please upload a PDF exam sheet!");
      return;
    }
    if (activeInputTab === "text" && !rawText.trim()) {
      alert("Please paste the exam content text!");
      return;
    }

    setIsSubmitting(true);
    setOcrError(null);

    try {
      await createOcrTask(
        activeInputTab === "file" ? pdfFile : null,
        activeInputTab === "text" ? rawText : "",
        addToBank,
        examTitleInput,
        examSubjectInput,
        examGradeInput,
        examDurationInput
      );
      
      // Reset inputs
      setPdfFile(null);
      setRawText("");
      
      // Proactively reload lists
      await loadTasks();
      
      alert("🚀 Background OCR processing task initiated successfully. You do not need to wait!");
    } catch (err: any) {
      console.error(err);
      setOcrError(err?.message || "Error creating OCR task.");
      alert("Error creating task: " + (err?.message || "Please check backend server!"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewTaskResult = async (taskId: string) => {
    try {
      const task = await fetchOcrTask(taskId);
      if (task.status === "completed" && task.result) {
        setImportedQuestions(task.result.questions);
        setImportedRawText(task.result.raw_text);
      } else if (task.status === "failed") {
        alert(`Task failed with error: ${task.error || "Unknown reason"}`);
      } else {
        alert("Task is currently processing in the background. Please wait!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteOcrTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveImportedToBank = async () => {
    if (importedQuestions.length === 0) {
      alert("There are no questions to save!");
      return;
    }
    setIsSavingToBank(true);
    try {
      await createExam({
        title: examTitleInput,
        subject: examSubjectInput,
        grade: examGradeInput,
        duration_minutes: examDurationInput,
        questions: importedQuestions,
      });
      alert("Successfully saved new exam to the Exam Bank!");
      onExamCreated();
    } catch (e) {
      console.error(e);
      alert("Error saving exam to the bank!");
    } finally {
      setIsSavingToBank(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full max-w-7xl mx-auto pb-12">
      {/* Left pane: Upload PDF and controls */}
      <div className="lg:col-span-5 space-y-5">
        <Card className="border-border">
          <CardContent className="p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Import Exam via AI OCR</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Automatically extract questions and options from raw PDF sheets or text.
              </p>
            </div>

            {/* Input tabs switcher */}
            <div className="flex p-0.5 bg-muted/60 rounded-lg border border-border/80 h-8">
              <button
                onClick={() => setActiveInputTab("file")}
                className={`flex-1 text-[11px] font-semibold rounded-md transition-all ${
                  activeInputTab === "file"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload PDF File
              </button>
              <button
                onClick={() => setActiveInputTab("text")}
                className={`flex-1 text-[11px] font-semibold rounded-md transition-all ${
                  activeInputTab === "text"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Paste Raw Text
              </button>
            </div>

            {/* Content inputs */}
            {activeInputTab === "file" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none duration-200 ${
                  isDragging
                    ? "border-primary bg-primary/5 ring-4 ring-primary/10 scale-[0.99]"
                    : "border-border/80 bg-muted/10 hover:bg-muted/20 hover:border-primary/40"
                }`}
                onClick={() => document.getElementById("file-select-inp")?.click()}
              >
                <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
                <p className="text-xs font-semibold text-foreground">
                  {pdfFile ? pdfFile.name : "Drag and drop exam PDF file here"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
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
                className="text-xs min-h-[135px] bg-card border-border/80 focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}

            {/* New Exam details metadata fields */}
            <div className="border border-border/60 rounded-xl p-3.5 bg-muted/10 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/40 pb-1.5">
                <Sliders className="h-3.5 w-3.5" /> New Exam Meta Details
              </p>
              
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Exam Title:</label>
                <Input
                  value={examTitleInput}
                  onChange={(e) => setExamTitleInput(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Subject:</label>
                  <Input
                    value={examSubjectInput}
                    onChange={(e) => setExamSubjectInput(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Grade:</label>
                  <Input
                    value={examGradeInput}
                    onChange={(e) => setExamGradeInput(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Duration (mins):</label>
                <Input
                  type="number"
                  value={examDurationInput}
                  onChange={(e) => setExamDurationInput(parseInt(e.target.value, 10) || 45)}
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* Auto Save switch toggle */}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Auto-save to Exam Bank
                </span>
                <Switch
                  checked={addToBank}
                  onCheckedChange={setAddToBank}
                  className="scale-90"
                />
              </div>
            </div>

            {/* Error alerts */}
            {ocrError && (
              <div className="p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-[11px] leading-relaxed flex gap-1.5 items-start">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{ocrError}</span>
              </div>
            )}

            {/* Trigger Button */}
            <Button
              className="w-full h-9 text-xs font-semibold gap-1.5"
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

        {/* Background Task Manager */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Running OCR Tasks ({tasks.filter(t => t.status === "pending" || t.status === "processing").length})
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={loadTasks} className="h-6 w-6 text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-2 divide-y divide-border/40 max-h-56 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No tasks are currently running.
              </div>
            ) : (
              tasks.map((task) => {
                const isPending = task.status === "pending";
                const isProcessing = task.status === "processing";
                const isCompleted = task.status === "completed";
                const isFailed = task.status === "failed";
                
                return (
                  <div
                    key={task.id}
                    onClick={() => handleViewTaskResult(task.id)}
                    className="p-2.5 hover:bg-muted/30 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-foreground truncate max-w-[200px]" title={task.filename || "Raw Text"}>
                        {task.filename || "Raw Text"}
                      </p>
                      
                      {/* Sub text stats */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{task.title}</span>
                        <span>•</span>
                        <span>
                          {task.add_to_bank ? "✓ Auto-save" : "Extract only"}
                        </span>
                      </div>
                      
                      {/* Simple progress bar */}
                      {(isPending || isProcessing) && (
                        <Progress value={task.progress} className="h-1 mt-1" />
                      )}
                    </div>

                    {/* Actions and Status indicators */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isCompleted && (
                        <Badge variant="secondary" className="text-[9px] bg-green-500/10 text-green-600 hover:bg-green-500/10 py-0 flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" /> {task.added_to_bank_id ? "Saved to Bank" : "Click to View"}
                        </Badge>
                      )}
                      {isFailed && (
                        <Badge variant="destructive" className="text-[9px] py-0">
                          Failed
                        </Badge>
                      )}
                      {(isPending || isProcessing) && (
                        <Badge variant="outline" className="text-[9px] py-0 gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" /> Running
                        </Badge>
                      )}
                      
                      <button
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right pane: Review Output & Structure */}
      <div className="lg:col-span-7 flex flex-col h-full space-y-5">
        <Card className="border-border flex-1 flex flex-col min-w-0">
          <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              OCR Result ({importedQuestions.length} questions)
            </CardTitle>
            
            {importedQuestions.length > 0 && (
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowRawText(!showRawText)}
                  className="h-7 text-[10px] gap-1"
                >
                  {showRawText ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showRawText ? "Hide Raw Text" : "View Raw Text"}
                </Button>
                
                {!addToBank && (
                  <Button 
                    size="sm" 
                    onClick={handleSaveImportedToBank} 
                    disabled={isSavingToBank}
                    className="h-7 text-[10px] gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" /> Save to Exam Bank
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-4 flex-1 overflow-y-auto max-h-[calc(100vh-12rem)] space-y-4">
            {importedQuestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground text-xs space-y-1.5">
                <BookOpen className="h-8 w-8 opacity-40 mb-1" />
                <p>No OCR data available.</p>
                <p className="text-[11px]">Upload a PDF file or paste text and click "Start OCR".</p>
              </div>
            ) : showRawText ? (
              <pre className="font-mono text-[11px] leading-relaxed p-4 bg-muted/40 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap">
                {importedRawText}
              </pre>
            ) : (
              <div className="space-y-3.5 divide-y divide-border/30">
                {importedQuestions.map((q, idx) => (
                  <div key={q.id || idx} className="pt-3.5 first:pt-0">
                    <QuestionPreviewCard question={q} index={idx} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
