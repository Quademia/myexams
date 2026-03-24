"use client";

// Client component for creating/editing exam questions.
// Handles dynamic MCQ option adding/removing which requires client-side state.
// Includes per-option feedback fields matching the old build.

import { useState } from "react";

type QuestionData = {
  id?: string;
  question_type: string;
  question_text: string;
  marks: number;
  partial_marking: number;
  model_answer: string | null;
  feedback: string | null;
  options: { option_text: string; is_correct: number; feedback: string | null }[];
};

export function QuestionForm({
  examId,
  addAction,
  editAction,
  initial,
  onCancel,
}: {
  examId: string;
  addAction: (formData: FormData) => void;
  editAction: (formData: FormData) => void;
  initial?: QuestionData;
  onCancel?: string;
}) {
  const isEditing = !!initial?.id;
  const [qType, setQType] = useState(initial?.question_type || "MCQ");
  const [options, setOptions] = useState<{ text: string; correct: boolean; feedback: string }[]>(
    initial?.options?.map(o => ({ text: o.option_text, correct: o.is_correct === 1, feedback: o.feedback || "" })) ||
    [{ text: "", correct: true, feedback: "" }, { text: "", correct: false, feedback: "" }, { text: "", correct: false, feedback: "" }, { text: "", correct: false, feedback: "" }]
  );
  const [tfCorrect, setTfCorrect] = useState(
    initial?.options?.find(o => o.is_correct === 1)?.option_text === "False" ? "False" : "True"
  );

  const needsOptions = qType === "MCQ" || qType === "MULTIPLE_SELECT";
  const isTF = qType === "TRUE_FALSE";

  const addOption = () => setOptions([...options, { text: "", correct: false, feedback: "" }]);
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  return (
    <form action={isEditing ? editAction : addAction} className="space-y-3">
      <input type="hidden" name="exam_id" value={examId} />
      {isEditing && <input type="hidden" name="question_id" value={initial!.id} />}

      {/* Question type */}
      <div>
        <label className="block text-sm font-medium mb-1">Question type</label>
        <select
          name="question_type"
          value={qType}
          onChange={(e) => setQType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="MCQ">Multiple Choice</option>
          <option value="MULTIPLE_SELECT">Multiple Select</option>
          <option value="TRUE_FALSE">True / False</option>
          <option value="SHORT_ANSWER">Short Answer</option>
          <option value="ESSAY">Essay</option>
        </select>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-sm font-medium mb-1">Question text *</label>
        <textarea
          name="question_text"
          required
          rows={3}
          defaultValue={initial?.question_text || ""}
          placeholder="Enter the question..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* Marks */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Marks</label>
          <input
            name="marks"
            type="number"
            min="0.5"
            step="0.5"
            defaultValue={initial?.marks ?? 1}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {qType === "MULTIPLE_SELECT" && (
          <div>
            <label className="block text-sm font-medium mb-1">Partial marking</label>
            <select
              name="partial_marking"
              defaultValue={String(initial?.partial_marking ?? 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </div>
        )}
      </div>

      {/* MCQ / Multiple Select options with per-option feedback */}
      {needsOptions && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Options {qType === "MCQ" ? "(select one correct)" : "(select all correct)"}
          </label>
          <div className="space-y-3">
            {options.map((opt, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1">
                <div className="flex gap-2 items-center">
                  <input
                    type={qType === "MCQ" ? "radio" : "checkbox"}
                    name="opt_correct[]"
                    value={String(i)}
                    checked={opt.correct}
                    onChange={() => {
                      if (qType === "MCQ") {
                        setOptions(options.map((o, j) => ({ ...o, correct: j === i })));
                      } else {
                        setOptions(options.map((o, j) => j === i ? { ...o, correct: !o.correct } : o));
                      }
                    }}
                    className="shrink-0"
                  />
                  <input
                    type="text"
                    name="opt_text[]"
                    value={opt.text}
                    onChange={(e) => setOptions(options.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="px-2 py-1 text-red-500 text-xs hover:bg-red-50 rounded"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  name="opt_feedback[]"
                  value={opt.feedback}
                  onChange={(e) => setOptions(options.map((o, j) => j === i ? { ...o, feedback: e.target.value } : o))}
                  placeholder="Option feedback (optional — shown after grading)"
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 ml-6"
                  style={{ width: "calc(100% - 1.5rem)" }}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="mt-2 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200"
          >
            + Add option
          </button>
        </div>
      )}

      {/* True/False */}
      {isTF && (
        <div>
          <label className="block text-sm font-medium mb-1">Correct answer</label>
          <select
            name="tf_correct"
            value={tfCorrect}
            onChange={(e) => setTfCorrect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="True">True</option>
            <option value="False">False</option>
          </select>
        </div>
      )}

      {/* Model answer (short answer only) */}
      {qType === "SHORT_ANSWER" && (
        <div>
          <label className="block text-sm font-medium mb-1">Model answer <span className="text-gray-400">(optional)</span></label>
          <input
            name="model_answer"
            defaultValue={initial?.model_answer || ""}
            placeholder="Expected answer"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}

      {/* Feedback */}
      <div>
        <label className="block text-sm font-medium mb-1">Feedback <span className="text-gray-400">(optional)</span></label>
        <textarea
          name="feedback"
          rows={2}
          defaultValue={initial?.feedback || ""}
          placeholder="Shown to students after grading..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* Submit */}
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
        >
          {isEditing ? "Update Question" : "Add Question"}
        </button>
        {onCancel && (
          <a
            href={onCancel}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 no-underline"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
