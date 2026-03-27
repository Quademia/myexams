"use client";
import { useState } from "react";

interface QuestionOption {
  option_text: string;
}

interface Question {
  id: string;
  question_type: string;
  question_text: string;
  marks: number;
  options: QuestionOption[];
}

function qTypeLabel(t: string): string {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
}

function QuestionCard({
  q,
  index,
  isApproverMode,
  myComments,
  otherCommentsByQ,
}: {
  q: Question;
  index: number;
  isApproverMode: boolean;
  myComments: Record<string, string>;
  otherCommentsByQ: Record<string, { approver_name: string; comment: string }[]>;
}) {
  const isChoice =
    q.question_type === "MCQ" ||
    q.question_type === "TRUE_FALSE" ||
    q.question_type === "MULTIPLE_SELECT";
  const isMultiSelect = q.question_type === "MULTIPLE_SELECT";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 bg-teal-700 text-white text-xs font-bold rounded-full shrink-0">
            {index + 1}
          </span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {qTypeLabel(q.question_type)}
          </span>
        </div>
        <span className="text-xs font-semibold text-gray-500 shrink-0">
          {q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}
        </span>
      </div>

      {/* Question text */}
      <p className="text-sm text-gray-800 leading-relaxed mb-3">
        {q.question_text}
      </p>

      {/* Options — all rendered identically, no correct answer highlighting */}
      {isChoice && q.options.length > 0 && (
        <div className="space-y-2">
          {q.options.map((opt, oi) => (
            <div
              key={oi}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-sm"
            >
              <input
                type={isMultiSelect ? "checkbox" : "radio"}
                disabled
                className="w-4 h-4 shrink-0"
                name={`preview_q_${q.id}`}
              />
              {opt.option_text}
            </div>
          ))}
        </div>
      )}

      {/* Short answer / Essay placeholder */}
      {q.question_type === "SHORT_ANSWER" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-400 italic">
          Student types a short answer here…
        </div>
      )}
      {q.question_type === "ESSAY" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-400 italic">
          Student writes a long-form essay here…
        </div>
      )}

      {/* Other approvers' comments (read-only) */}
      {(otherCommentsByQ[q.id] || []).length > 0 && (
        <div className="mt-3 space-y-1">
          {otherCommentsByQ[q.id].map((c, ci) => (
            <div
              key={ci}
              className="p-2 bg-purple-50 border border-purple-200 rounded-lg"
            >
              <p className="text-[11px] font-semibold text-purple-600">
                {c.approver_name}
              </p>
              <p className="text-xs text-purple-800">{c.comment}</p>
            </div>
          ))}
        </div>
      )}

      {/* This approver's comment textarea */}
      {isApproverMode && (
        <div className="mt-3">
          <label className="block text-[11px] font-semibold text-blue-600 mb-1">
            Your comment on Q{index + 1} (optional)
          </label>
          <textarea
            name={`comment_${q.id}`}
            rows={2}
            defaultValue={myComments[q.id] || ""}
            placeholder="Add a comment about this question…"
            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-blue-50"
          />
        </div>
      )}
    </div>
  );
}

export function PreviewToggle({
  questions,
  isApproverMode,
  myComments,
  otherCommentsByQ,
}: {
  questions: Question[];
  isApproverMode: boolean;
  approverGateType: string | null;
  myComments: Record<string, string>;
  otherCommentsByQ: Record<string, { approver_name: string; comment: string }[]>;
  examId: string;
}) {
  const [viewMode, setViewMode] = useState<"all" | "one">("all");
  const [currentIndex, setCurrentIndex] = useState(0);

  if (questions.length === 0) return null;

  return (
    <div>
      {/* Toggle buttons */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setViewMode("all")}
          className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${
            viewMode === "all"
              ? "bg-teal-700 text-white"
              : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          All questions
        </button>
        <button
          type="button"
          onClick={() => { setViewMode("one"); setCurrentIndex(0); }}
          className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${
            viewMode === "one"
              ? "bg-teal-700 text-white"
              : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          One at a time
        </button>
      </div>

      {/* All questions mode */}
      {viewMode === "all" &&
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            isApproverMode={isApproverMode}
            myComments={myComments}
            otherCommentsByQ={otherCommentsByQ}
          />
        ))}

      {/* One at a time mode */}
      {viewMode === "one" && questions[currentIndex] && (
        <>
          <div className="text-center text-sm text-gray-500 mb-2">
            Question {currentIndex + 1} of {questions.length}
          </div>
          <QuestionCard
            q={questions[currentIndex]}
            index={currentIndex}
            isApproverMode={isApproverMode}
            myComments={myComments}
            otherCommentsByQ={otherCommentsByQ}
          />
          <div className="flex justify-between mt-2">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((i) => i + 1)}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
