import { useState } from "react";
import type { Exam } from "@/types/exam";
import { Search, Clock, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExamViewer } from "./ExamViewer";


interface ExamBankProps {
  exams: Exam[];
  selectedExam: Exam | null;
  setSelectedExam: (exam: Exam) => void;
  onOpenOcrTab: () => void;
  onStartExam: (exam: Exam) => void;
}

export function ExamBank({
  exams,
  selectedExam,
  setSelectedExam,
  onOpenOcrTab,
  onStartExam,
}: ExamBankProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredExams = exams.filter(
    (e) =>
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.grade.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
      {/* Left List Pane */}
      <div className="lg:col-span-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Danh Sách Đề Thi ({exams.length})</h2>
          <Button size="sm" onClick={onOpenOcrTab} className="h-8 gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Thêm từ PDF/OCR
          </Button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm theo tên đề, môn học, lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Exam Cards */}
        <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-12rem)] pr-1">
          {filteredExams.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
              Không tìm thấy đề thi phù hợp.
            </div>
          ) : (
            filteredExams.map((exam) => {
              const isSelected = selectedExam?.id === exam.id;
              return (
                <div
                  key={exam.id}
                  onClick={() => setSelectedExam(exam)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2 ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] py-0">
                        {exam.subject}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {exam.grade}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {exam.duration_minutes} phút
                    </span>
                  </div>

                  <h3 className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                    {exam.title}
                  </h3>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                    <span>{exam.questions.length} câu hỏi</span>
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartExam(exam);
                      }}
                      className="h-6 px-2 text-[10px]"
                    >
                      Vào Thi
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Preview Pane */}
      <div className="lg:col-span-7 border-l border-border pl-6 pr-2 pt-4 overflow-y-auto max-h-[calc(100vh-8rem)] scroll-pt-4">
        <ExamViewer exam={selectedExam} />
      </div>

    </div>
  );
}
