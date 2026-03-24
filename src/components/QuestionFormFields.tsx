"use client";

// QuestionFormFields — client component for the exam builder question form.
//
// WHY THIS IS A SEPARATE FILE:
// Next.js server components (like exam-builder/page.tsx) can't use useState
// or event handlers. But a question form needs dynamic behaviour:
// - Changing the question type shows/hides different fields
// - Adding and removing option rows for MCQ questions
// - Toggling partial marking for multiple-select questions
//
// So this component handles ONLY the interactive parts of the form.
// The <form> tag with its server action stays in the server component
// (page.tsx), which wraps this component. That way the form submits
// directly to a server action — no client-side fetch needed.
//
// WHAT THIS COMPONENT RECEIVES:
// Only plain data (strings, numbers, booleans, arrays of objects).
// It never receives functions or server actions as props.

import { useState } from "react";

interface OptionRow {
  text: string;
  isCorrect: boolean;
  feedback: string;
}

interface Props {
  questionType: string;
  options: OptionRow[];
  tfCorrect: string;
  modelAnswer: string;
  feedback: string;
  questionText: string;
  marks: number;
  partialMarking: boolean;
  isEdit: boolean;
  questionId: string;
  examId: string;
}

export function QuestionFormFields({
  questionType,
  options,
  tfCorrect,
  modelAnswer,
  feedback,
  questionText,
  marks,
  partialMarking,
  isEdit,
  questionId,
  examId,
}: Props) {
  // ── State ──────────────────────────────────────────────────────────────────
  // selectedType controls which fields are visible (MCQ shows option rows,
  // TRUE_FALSE shows two radio buttons, SHORT_ANSWER shows a model answer, etc.)
  const [selectedType, setSelectedType] = useState(questionType);

  // optionRows is an array of {text, isCorrect, feedback} objects.
  // For a new question it starts with 2 empty rows. For editing it starts
  // with the existing options loaded from the database.
  const [optionRows, setOptionRows] = useState<OptionRow[]>(
    options.length > 0
      ? options
      : [
          { text: "", isCorrect: false, feedback: "" },
          { text: "", isCorrect: false, feedback: "" },
        ]
  );

  // For TRUE_FALSE: which answer is correct ('True' or 'False').
  const [tfValue, setTfValue] = useState(tfCorrect);

  // For MULTIPLE_SELECT: whether partial marking is enabled.
  // Partial marking means students get some credit for selecting
  // some (but not all) correct answers.
  const [partialMarkingOn, setPartialMarkingOn] = useState(partialMarking);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addOption = () => {
    setOptionRows((prev) => [...prev, { text: "", isCorrect: false, feedback: "" }]);
  };

  const removeOption = (idx: number) => {
    // Keep at least 2 options so the question makes sense.
    if (optionRows.length <= 2) return;
    setOptionRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, field: keyof OptionRow, value: string | boolean) => {
    setOptionRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) {
          // For MCQ (single correct answer), uncheck all other rows
          // when one is selected.
          if (field === "isCorrect" && value === true && selectedType === "MCQ") {
            return { ...row, isCorrect: false };
          }
          return row;
        }
        return { ...row, [field]: value };
      })
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // These are all the fields that go INSIDE the <form> in the server component.
  // The form tag and its action={} live in page.tsx.
  return (
    <div className="space-y-4">
      {/* Hidden fields the server action needs to identify the question */}
      <input type="hidden" name="exam_id" value={examId} />
      {isEdit && <input type="hidden" name="question_id" value={questionId} />}

      {/* Row 1: Question type + marks side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Question type</label>
          <select
            name="question_type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="MCQ">Multiple Choice</option>
            <option value="MULTIPLE_SELECT">Multiple Select</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="SHORT_ANSWER">Short Answer</option>
            <option value="ESSAY">Essay</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Marks</label>
          <input
            name="marks"
            type="number"
            min={0.5}
            step={0.5}
            defaultValue={marks}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-sm font-medium mb-1">Question text</label>
        <textarea
          name="question_text"
          rows={3}
          defaultValue={questionText}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Type your question here…"
        />
      </div>

      {/* ── MCQ or MULTIPLE_SELECT: dynamic option rows ─────────────────────── */}
      {(selectedType === "MCQ" || selectedType === "MULTIPLE_SELECT") && (
        <div>
          <label className="block text-sm font-medium mb-2">Options</label>
          <p className="text-xs text-gray-400 mb-2">
            {selectedType === "MCQ"
              ? "Select the one correct answer."
              : "Tick all correct answers."}
          </p>

          {optionRows.map((row, idx) => (
            <div key={idx} className="flex items-start gap-2 mb-2 p-2 bg-gray-50 rounded-lg">
              {/* Correct answer selector */}
              <div className="pt-2">
                {selectedType === "MCQ" ? (
                  // Radio: only one can be correct
                  <input
                    type="radio"
                    name="opt_correct_radio"
                    checked={row.isCorrect}
                    onChange={() => updateOption(idx, "isCorrect", true)}
                    className="mt-0.5"
                    title="Mark as correct answer"
                  />
                ) : (
                  // Checkbox: multiple can be correct
                  <input
                    type="checkbox"
                    checked={row.isCorrect}
                    onChange={(e) => updateOption(idx, "isCorrect", e.target.checked)}
                    className="mt-0.5"
                    title="Mark as correct answer"
                  />
                )}
              </div>

              <div className="flex-1 space-y-1">
                {/* Option text */}
                <input
                  type="text"
                  name="opt_text[]"
                  value={row.text}
                  onChange={(e) => updateOption(idx, "text", e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                />
                {/* Hidden input to mark which options are correct.
                    The server action reads opt_correct[] to know which indices are correct. */}
                {row.isCorrect && (
                  <input type="hidden" name="opt_correct[]" value={String(idx)} />
                )}
                {/* Per-option feedback (shown to student after grading) */}
                <input
                  type="text"
                  name="opt_feedback[]"
                  value={row.feedback}
                  onChange={(e) => updateOption(idx, "feedback", e.target.value)}
                  placeholder="Feedback for this option (optional)"
                  className="w-full px-2 py-1 border border-gray-100 rounded text-xs text-gray-500"
                />
              </div>

              {/* Remove option button */}
              <button
                type="button"
                onClick={() => removeOption(idx)}
                disabled={optionRows.length <= 2}
                className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-30 mt-2"
                title="Remove option"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addOption}
            className="text-sm text-teal-700 hover:underline mt-1"
          >
            + Add option
          </button>
        </div>
      )}

      {/* ── MULTIPLE_SELECT: partial marking toggle ─────────────────────────── */}
      {selectedType === "MULTIPLE_SELECT" && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={partialMarkingOn}
            onChange={(e) => setPartialMarkingOn(e.target.checked)}
            id="partial_marking_check"
          />
          <label htmlFor="partial_marking_check" className="text-sm">
            Enable partial marking
          </label>
          <input
            type="hidden"
            name="partial_marking"
            value={partialMarkingOn ? "1" : "0"}
          />
          <span className="text-xs text-gray-400">
            — students get proportional credit for each correct selection
          </span>
        </div>
      )}

      {/* ── TRUE_FALSE: two fixed radio options ─────────────────────────────── */}
      {selectedType === "TRUE_FALSE" && (
        <div>
          <label className="block text-sm font-medium mb-2">Correct answer</label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tf_correct"
                value="True"
                checked={tfValue === "True"}
                onChange={() => setTfValue("True")}
              />
              True
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tf_correct"
                value="False"
                checked={tfValue === "False"}
                onChange={() => setTfValue("False")}
              />
              False
            </label>
          </div>
        </div>
      )}

      {/* ── SHORT_ANSWER: model answer ──────────────────────────────────────── */}
      {selectedType === "SHORT_ANSWER" && (
        <div>
          <label className="block text-sm font-medium mb-1">
            Model answer <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            name="model_answer"
            defaultValue={modelAnswer}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="The expected correct answer"
          />
        </div>
      )}

      {/* ── Feedback (all types) ────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium mb-1">
          General feedback <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          name="feedback"
          rows={2}
          defaultValue={feedback}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Shown to student after grading — explain why the answer is correct"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
      >
        {isEdit ? "Save changes" : "Add question"}
      </button>

      {isEdit && (
        <a
          href={`/exam-builder?exam_id=${examId}&tab=questions`}
          className="ml-3 text-sm text-gray-500 hover:underline"
        >
          Cancel
        </a>
      )}
    </div>
  );
}
