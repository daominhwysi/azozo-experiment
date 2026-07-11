import type { Exam, CreateExamPayload, ParseExamResponse, TestResult } from "@/types/exam";
import { topLoader } from "@/components/ui/top-loader";

const API_BASE = "/api";

export async function fetchExams(): Promise<Exam[]> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams`);
    if (!res.ok) {
      throw new Error(`Failed to fetch exams: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export async function fetchExamById(examId: string): Promise<Exam> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams/${examId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch exam ${examId}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export async function createExam(payload: CreateExamPayload): Promise<Exam> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Failed to create exam: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export async function updateExam(examId: string, payload: CreateExamPayload): Promise<Exam> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams/${examId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Failed to update exam: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}


export async function parseExamFromPdfOrText(
  file: File | null,
  rawText: string
): Promise<ParseExamResponse> {
  topLoader.start();
  try {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    if (rawText) {
      formData.append("raw_text", rawText);
    }

    const res = await fetch(`${API_BASE}/parse-exam`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to parse OCR exam: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export interface StreamProgressEvent {
  type: "ocr_start" | "ocr_progress" | "ocr_complete" | "annotate_start" | "annotate_progress" | "complete" | "error";
  step: number;
  step_name: string;
  progress: number;
  message: string;
  streamed_tokens?: number;
  estimated_tokens?: number;
  result?: ParseExamResponse;
}

export async function parseExamFromPdfOrTextStream(
  file: File | null,
  rawText: string,
  onProgress: (event: StreamProgressEvent) => void,
): Promise<ParseExamResponse> {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (rawText) formData.append("raw_text", rawText);

  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/parse-exam-stream`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to stream parse OCR: ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let finalResult: ParseExamResponse | null = null;
    let buffer = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.substring(6);
            try {
              const data: StreamProgressEvent = JSON.parse(jsonStr);
              onProgress(data);
              if (data.type === "complete" && data.result) {
                finalResult = data.result;
              } else if (data.type === "error") {
                throw new Error(data.message || "Lỗi bóc tách OCR từ backend");
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("Lỗi bóc tách")) {
                throw e;
              }
            }
          }
        }
      }
    }

    if (!finalResult) {
      throw new Error("Không nhận được dữ liệu hoàn tất từ backend");
    }

    return finalResult;
  } finally {
    topLoader.done();
  }
}

export async function deleteExam(examId: string): Promise<void> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams/${examId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      if (res.status === 404) throw new Error("Exam not found");
      throw new Error(`Failed to delete exam: ${res.statusText}`);
    }
  } finally {
    topLoader.done();
  }
}

export async function submitExam(
  examId: string,
  studentName: string,
  answers: Record<string, string>
): Promise<TestResult> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams/${examId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_name: studentName,
        student_code: "STU001",
        answers,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to submit exam: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export async function importAnswers(
  examId: string,
  file: File | null,
  rawText: string
): Promise<{ success: boolean; exam: Exam; extracted_text: string; mapping: Record<string, string> }> {
  topLoader.start();
  try {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    if (rawText) {
      formData.append("raw_text", rawText);
    }

    const res = await fetch(`${API_BASE}/exams/${examId}/import-answers`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to import answers: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export interface OcrTask {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  filename: string | null;
  add_to_bank: boolean;
  title: string;
  subject: string;
  grade: string;
  duration_minutes: number;
  created_at: string;
  completed_at?: string;
  error?: string;
  added_to_bank_id?: string;
  result?: ParseExamResponse;
}

export async function createOcrTask(
  file: File | null,
  rawText: string,
  addToBank: boolean,
  title: string,
  subject: string,
  grade: string,
  durationMinutes: number
): Promise<{ task_id: string; status: string }> {
  topLoader.start();
  try {
    const formData = new FormData();
    if (file) formData.append("file", file);
    if (rawText) formData.append("raw_text", rawText);
    formData.append("add_to_bank", String(addToBank));
    formData.append("title", title);
    formData.append("subject", subject);
    formData.append("grade", grade);
    formData.append("duration_minutes", String(durationMinutes));

    const res = await fetch(`${API_BASE}/ocr-tasks`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to create OCR task: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export async function fetchOcrTasks(): Promise<OcrTask[]> {
  const res = await fetch(`${API_BASE}/ocr-tasks`);
  if (!res.ok) {
    throw new Error(`Failed to fetch OCR tasks: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchOcrTask(taskId: string): Promise<OcrTask> {
  const res = await fetch(`${API_BASE}/ocr-tasks/${taskId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch OCR task: ${res.statusText}`);
  }
  return await res.json();
}

export async function deleteOcrTask(taskId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/ocr-tasks/${taskId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete OCR task: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchSubmissions(examId?: string): Promise<TestResult[]> {
  topLoader.start();
  try {
    const url = examId ? `${API_BASE}/exams/submissions?exam_id=${examId}` : `${API_BASE}/exams/submissions`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch submissions: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    topLoader.done();
  }
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  topLoader.start();
  try {
    const res = await fetch(`${API_BASE}/exams/submissions/${submissionId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(`Failed to delete submission: ${res.statusText}`);
    }
  } finally {
    topLoader.done();
  }
}


