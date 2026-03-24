"use client";

// BankQuestionFormFields — client component for the question bank add/edit form.
//
// Almost identical to QuestionFormFields, but also includes a "visibility"
// dropdown (Personal vs Share with school). The <form> tag with its server
// action lives in question-bank/page.tsx (the server component).

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
  visibility: string;
  isEdit: boolean;
  questionId: string;
}

export function BankQuestionFormFields({
  questionType,
  options,
  tfCorrect,
  modelAnswer,
  feedback,
  questionText,
  marks,
  partialMarking,
  visibility,
  isEdit,
  questionId,
}: Props) {
  const [selectedType, setSelectedType] = useState(questionType);

  const [optionRows, setOptionRows] = useState<OptionRow[]>(
    options.length > 0
      ? options
      : [
          { text: "", isCorrect: false, feedback: "" },
          { text: "", isCorrect: false, feedback: "" },
        ]
  );

  const [tfValue, setTfValue] = useState(tfCorrect);
  const [partialMarkingOn, setPartialMarkingOn] = useState(partialMarking);

  const addOption = () => {
    setOptionRows((prev) => [...prev, { text: "", isCorrect: false, feedback: "" }]);
  };

  const removeOption = (idx: number) => {
    if (optionRows.length <= 2) return;
    setOptionRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, field: keyof OptionRow, value: string | boolean) => {
    setOptionRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) {
          if (field === "isCorrect" && value === true && selectedType === "MCQ") {
            return { ...row, isCorrect: false };
          }
          return row;
        }
        return { ...row, [field]: value };
      })
    );
  };

  return (
    <div className="space-y-4">
      {isEdit && <input type="hidden" name="question_id" value={questionId} />}

      {/* Row 1: Question type + marks + visibility */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        <div>
          <label className="block text-sm font-medium mb-1">Visibility</label>
          <select
            name="visibility"
            defaultValue={visibility}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="PERSONAL">Personal</option>
            <option value="SCHOOL">Share with school</option>
          </select>
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

      {/* MCQ or MULTIPLE_SELECT option rows */}
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
              <div className="pt-2">
                {selectedType === "MCQ" ? (
                  <input
                    type="radio"
                    name="opt_correct_radio"
                    checked={row.isCorrect}
                    onChange={() => updateOption(idx, "isCorrect", true)}
                    className="mt-0.5"
                    title="Mark as correct answer"
                  />
                ) : (
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
                <input
                  type="text"
                  name="opt_text[]"
                  value={row.text}
                  onChange={(e) => updateOption(idx, "text", e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                />
                {row.isCorrect && (
                  <input type="hidden" name="opt_correct[]" value={String(idx)} />
                )}
                <input
                  type="text"
                  name="opt_feedback[]"
                  value={row.feedback}
                  onChange={(e) => updateOption(idx, "feedback", e.target.value)}
                  placeholder="Feedback for this option (optional)"
                  className="w-full px-2 py-1 border border-gray-100 rounded text-xs text-gray-500"
                />
              </div>

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

      {/* MULTIPLE_SELECT: partial marking toggle */}
      {selectedType === "MULTIPLE_SELECT" && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={partialMarkingOn}
            onChange={(e) => setPartialMarkingOn(e.target.checked)}
            id="bank_partial_marking_check"
          />
          <label htmlFor="bank_partial_marking_check" className="text-sm">
            Enable partial marking
          </label>
          <input type="hidden" name="partial_marking" value={partialMarkingOn ? "1" : "0"} />
          <span className="text-xs text-gray-400">
            — students get proportional credit for each correct selection
          </span>
        </div>
      )}

      {/* TRUE_FALSE: two radio options */}
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

      {/* SHORT_ANSWER: model answer */}
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

      {/* Feedback (all types) */}
      <div>
        <label className="block text-sm font-medium mb-1">
          General feedback <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          name="feedback"
          rows={2}
          defaultValue={feedback}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Shown to student after grading"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
      >
        {isEdit ? "Save changes" : "Add to bank"}
      </button>

      {isEdit && (
        <a
          href="/question-bank"
          className="ml-3 text-sm text-gray-500 hover:underline"
        >
          Cancel
        </a>
      )}
    </div>
  );
}
