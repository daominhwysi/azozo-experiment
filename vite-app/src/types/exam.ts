export interface Option {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  question_number: string;
  stem: string;
  options: Option[];
  correct_answer: string;
  explanation: string;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration_minutes: number;
  created_at: string;
  questions: Question[];
}

export interface DetailedResult {
  question_id: string;
  question_number: string;
  stem: string;
  options: Option[];
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
}

export interface TestResult {
  id: string;
  exam_id: string;
  exam_title: string;
  student_name: string;
  student_code: string;
  submitted_at: string;
  total_questions: number;
  correct_count: number;
  score: number;
  percentage: number;
  detailed_results: DetailedResult[];
}

export interface CreateExamPayload {
  title: string;
  subject: string;
  grade: string;
  duration_minutes: number;
  questions: Question[];
}

export interface ParseExamResponse {
  success: boolean;
  filename: string | null;
  raw_text: string;
  raw_xml: string;
  spans_count: number;
  tokens_count: number;
  questions: Question[];
}
