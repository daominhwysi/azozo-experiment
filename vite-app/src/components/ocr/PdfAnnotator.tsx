import { useState, useRef } from "react";
import type { Question } from "@/types/exam";
import { parseExamFromPdfOrTextStream, createExam } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { UploadCloud, FileCode, Sliders, Check, Zap } from "lucide-react";
import { QuestionPreviewCard } from "./QuestionPreviewCard";
import { StagedProgressLoader, type ProgressStage } from "@/components/ui/staged-progress-loader";

const OCR_STAGES: ProgressStage[] = [
  {
    id: "ocr",
    label: "1. OCR (Bóc tách văn bản PDF)",
    description: "Khởi tạo PyMuPDF Text Extractor & Render trang PDF",
  },
  {
    id: "annotate",
    label: "2. Annotate (Gán nhãn XML bằng LLM)",
    description: "Nhận dạng nhãn BIO & Token streaming câu hỏi",
  },
];

interface PdfAnnotatorProps {
  onExamCreated: () => void;
}

export function PdfAnnotator({ onExamCreated }: PdfAnnotatorProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [importText, setImportText] = useState("");
  const [ocrInputMode, setOcrInputMode] = useState<"pdf" | "text">("pdf");
  const [parserMode, setParserMode] = useState<"anchor" | "full">("anchor");
  const [isParsingOCR, setIsParsingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [extractedRawText, setExtractedRawText] = useState("");
  const [showRawText, setShowRawText] = useState(false);
  const [importedQuestions, setImportedQuestions] = useState<Question[]>([]);

  // Exam Form State
  const [examTitleInput, setExamTitleInput] = useState("Đề Thi Thử Tốt Nghiệp THPT 2026");
  const [examSubjectInput, setExamSubjectInput] = useState("Toán Học");
  const [examGradeInput, setExamGradeInput] = useState("Lớp 12");
  const [examDurationInput, setExamDurationInput] = useState(45);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        setPdfFile(file);
        if (!examTitleInput || examTitleInput === "Đề Thi Thử Tốt Nghiệp THPT 2026") {
          setExamTitleInput(file.name.replace(/\.pdf$/i, ""));
        }
      } else {
        alert("Vui lòng chọn tập tin định dạng PDF (.pdf)");
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        setPdfFile(file);
        if (!examTitleInput || examTitleInput === "Đề Thi Thử Tốt Nghiệp THPT 2026") {
          setExamTitleInput(file.name.replace(/\.pdf$/i, ""));
        }
      } else {
        alert("Vui lòng chọn tập tin định dạng PDF (.pdf)");
      }
    }
  };

  const handleStartOCR = async () => {
    if (ocrInputMode === "pdf" && !pdfFile) {
      alert("Vui lòng tải lên 1 tập tin PDF đề thi!");
      return;
    }
    if (ocrInputMode === "text" && !importText.trim()) {
      alert("Vui lòng dán văn bản đề thi!");
      return;
    }

    setIsParsingOCR(true);
    setOcrError(null);
    setOcrProgress(10);
    setCurrentStageIndex(0);
    setOcrStatusText("Đang khởi tạo PyMuPDF Text Extractor...");

    try {
      const res = await parseExamFromPdfOrTextStream(
        ocrInputMode === "pdf" ? pdfFile : null,
        ocrInputMode === "text" ? importText : "",
        (evt) => {
          if (evt.type === "ocr_start" || evt.type === "ocr_progress" || evt.type === "ocr_complete") {
            setCurrentStageIndex(0);
            setOcrProgress(evt.progress);
            setOcrStatusText(evt.message);
          } else if (evt.type === "annotate_start" || evt.type === "annotate_progress") {
            setCurrentStageIndex(1);
            setOcrProgress(evt.progress);
            if (typeof evt.streamed_tokens === "number" && typeof evt.estimated_tokens === "number") {
              setOcrStatusText(`Đang gán nhãn LLM (${evt.streamed_tokens} / ~${evt.estimated_tokens} tokens)...`);
            } else {
              setOcrStatusText(evt.message);
            }
          } else if (evt.type === "complete") {
            setCurrentStageIndex(1);
            setOcrProgress(100);
            setOcrStatusText("Trích xuất câu hỏi hoàn tất!");
          }
        },
        parserMode
      );

      setExtractedRawText(res.raw_text || "");
      setImportedQuestions(res.questions || []);
    } catch (err: any) {
      console.error(err);
      setOcrError(err?.message || "Lỗi khi bóc tách OCR. Vui lòng kiểm tra lại backend!");
    } finally {
      setTimeout(() => {
        setIsParsingOCR(false);
      }, 600);
    }
  };

  const handleSaveToExamBank = async () => {
    if (importedQuestions.length === 0) {
      alert("Chưa có câu hỏi nào để lưu!");
      return;
    }

    try {
      await createExam({
        title: examTitleInput,
        subject: examSubjectInput,
        grade: examGradeInput,
        duration_minutes: examDurationInput,
        questions: importedQuestions,
      });

      alert("🎉 Đã lưu thành công đề thi mới vào Ngân hàng Đề Thi!");
      onExamCreated();
    } catch (e) {
      console.error(e);
      alert("Lỗi khi lưu đề thi vào ngân hàng!");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Bóc Tách & Nhận Dạng Đề Thi (Azota OCR Engine)
        </h1>
        <p className="text-xs text-muted-foreground">
          Trích xuất tự động danh sách câu hỏi và các phương án từ file PDF đề thi thực tế.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Input Settings & File Upload */}
        <div className="lg:col-span-5 space-y-4">
          {/* Input Mode Switcher */}
          <div className="flex bg-muted p-1 rounded-lg gap-1 border border-border">
            <button
              onClick={() => setOcrInputMode("pdf")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                ocrInputMode === "pdf"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tải File PDF
            </button>
            <button
              onClick={() => setOcrInputMode("text")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                ocrInputMode === "text"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dán Văn Bản Thô
            </button>
          </div>

          {/* LLM Parser Mode Switcher */}
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/60">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">Chế độ LLM:</span>
            </div>
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md border border-border text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setParserMode("full")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  parserMode === "full"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🎯 Full (100% Chuẩn)
              </button>
              <button
                type="button"
                onClick={() => setParserMode("anchor")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  parserMode === "anchor"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ⚡ Anchor (Siêu Tốc)
              </button>
            </div>
          </div>

          {ocrInputMode === "pdf" ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-primary/50 bg-card hover:bg-muted/20 p-6 rounded-xl text-center cursor-pointer transition-all space-y-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <UploadCloud className="h-8 w-8 text-primary mx-auto opacity-80" />
              <div className="text-xs font-semibold text-foreground">
                {pdfFile ? pdfFile.name : "Kéo thả file PDF đề thi vào đây"}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Hoặc nhấp để chọn file từ máy tính (.pdf)
              </p>
            </div>
          ) : (
            <Textarea
              placeholder="Dán nội dung đề thi tại đây (Ví dụ: Câu 1. Trong không gian... A. (1;2) B. (2;3)...)"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="h-44 text-xs font-mono"
            />
          )}

          {/* Exam Metadata Config */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5" /> Thông Tin Đề Thi Tạo Mới
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Tên đề thi:</label>
                <Input
                  value={examTitleInput}
                  onChange={(e) => setExamTitleInput(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Môn học:</label>
                  <Input
                    value={examSubjectInput}
                    onChange={(e) => setExamSubjectInput(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Khối lớp:</label>
                  <Input
                    value={examGradeInput}
                    onChange={(e) => setExamGradeInput(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Thời gian (phút):</label>
                <Input
                  type="number"
                  value={examDurationInput}
                  onChange={(e) => setExamDurationInput(Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>

              <Button
                onClick={handleStartOCR}
                disabled={isParsingOCR}
                className="w-full gap-1.5 h-9 text-xs"
              >
                {isParsingOCR ? (
                  "Đang Bóc Tách OCR..."
                ) : (
                  <>
                    <FileCode className="h-4 w-4" /> Bắt Đầu Bóc Tách OCR
                  </>
                )}
              </Button>

              {isParsingOCR && (
                <div className="pt-2">
                  <StagedProgressLoader
                    title="Bóc Tách & Nhận Dạng OCR"
                    subtitle="Quy trình bóc tách tự động Azota"
                    stages={OCR_STAGES}
                    currentStageIndex={currentStageIndex}
                    progress={ocrProgress}
                    statusText={ocrStatusText}
                    error={ocrError}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Preview Extracted Questions Pane */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              Kết Quả Bóc Tách ({importedQuestions.length} câu)
            </h2>
            {importedQuestions.length > 0 && (
              <div className="flex items-center gap-2">
                {extractedRawText && (
                  <Button
                    onClick={() => setShowRawText(!showRawText)}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                  >
                    {showRawText ? "Ẩn Text Gốc" : "Xem Text Gốc"}
                  </Button>
                )}
                <Button
                  onClick={handleSaveToExamBank}
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Check className="h-3.5 w-3.5" /> Lưu Vào Ngân Hàng Đề Thi
                </Button>

              </div>
            )}
          </div>

          {showRawText && extractedRawText && (
            <div className="p-3 bg-muted/50 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border">
              {extractedRawText}
            </div>
          )}

          <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-14rem)] pr-1 pt-2 px-1 scroll-pt-2">
            {importedQuestions.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground border border-dashed rounded-xl space-y-2">
                <FileCode className="h-8 w-8 mx-auto opacity-40" />
                <p>Chưa có dữ liệu bóc tách.</p>
                <p className="text-[11px]">Tải file PDF hoặc dán text và nhấn "Bắt Đầu Bóc Tách OCR".</p>
              </div>
            ) : (
              importedQuestions.map((q, idx) => (
                <QuestionPreviewCard key={q.id || idx} question={q} index={idx} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
