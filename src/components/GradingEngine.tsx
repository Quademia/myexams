// src/components/GradingEngine.tsx
// Client component — live grading UI with reactive sidebar, score total, and mobile FAB.
// Wraps the question cards, sidebar, and mobile drawer into one interactive unit.

"use client";

import { useState, useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────────────

interface Option {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: number;
  sort_order: number;
}

interface Answer {
  question_id: string;
  answer_json: string | null;
  score_awarded: number | null;
  teacher_note: string | null;
}

interface QuestionData {
  id: string;
  question_type: string;
  question_text: string;
  marks: number;
  model_answer: string | null;
  feedback: string | null;
  sort_order: number;
  options: Option[];
  answer: Answer | null;
  otherComments: { comment: string; approver_name: string }[];
  myComment: string;
}

export interface GradingEngineProps {
  attemptId: string;
  examId: string;
  mode: "grade" | "view" | "approver";
  questions: QuestionData[];
  baseScore: number;        // sum of already auto-graded scores (non-manual questions)
  scoreTotal: number;       // total marks possible across all questions
  initialUngradedIds: string[];  // question IDs that need manual grading
  // Server action URLs are not needed — form actions are passed as props
  gradeActionUrl?: string;
  // Display data
  attempt: {
    score_raw: number | null;
    score_total: number | null;
    score_pct: number | null;
    grade: string | null;
    pass_mark_percent: number | null;
  };
  // Banners
  gateDecisionBanner: React.ReactNode;
  approverBanner: React.ReactNode;
  viewOnlyBanner: React.ReactNode;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const qTypeLabel = (t: string) => {
  if (t === "MCQ") return "Multiple Choice";
  if (t === "MULTIPLE_SELECT") return "Multiple Select";
  if (t === "TRUE_FALSE") return "True / False";
  if (t === "SHORT_ANSWER") return "Short Answer";
  if (t === "ESSAY") return "Essay";
  return t;
};

// ── Component ────────────────────────────────────────────────────────────

export function GradingEngine({
  attemptId,
  examId,
  mode,
  questions,
  baseScore,
  scoreTotal,
  initialUngradedIds,
  attempt,
  gateDecisionBanner,
  approverBanner,
  viewOnlyBanner,
}: GradingEngineProps) {
  // Track which manual question IDs still need grading
  const [ungradedSet, setUngradedSet] = useState<Set<string>>(
    () => new Set(initialUngradedIds)
  );

  // Track live scores for manual questions (keyed by question ID)
  const [manualScores, setManualScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const q of questions) {
      if (
        (q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY") &&
        q.answer?.score_awarded !== null &&
        q.answer?.score_awarded !== undefined
      ) {
        init[q.id] = Number(q.answer.score_awarded);
      }
    }
    return init;
  });

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const needsManualGrading = mode === "grade";
  const isGradingApprover = mode === "approver";
  const viewOnly = mode === "view" || mode === "approver";

  // Derive ungraded list for sidebar
  const ungradedManual = useMemo(() => {
    return questions
      .map((q, i) => ({ ...q, number: i + 1 }))
      .filter(
        (q) =>
          (q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY") &&
          ungradedSet.has(q.id)
      );
  }, [questions, ungradedSet]);

  // Live score total
  const liveScore = useMemo(() => {
    let manual = 0;
    for (const val of Object.values(manualScores)) {
      manual += val;
    }
    return baseScore + manual;
  }, [baseScore, manualScores]);

  // Handle score input change
  function handleScoreChange(qId: string, value: string, maxMarks: number) {
    const trimmed = value.trim();
    if (trimmed === "") {
      // Cleared — mark as ungraded again
      setUngradedSet((prev) => {
        const next = new Set(prev);
        next.add(qId);
        return next;
      });
      setManualScores((prev) => {
        const next = { ...prev };
        delete next[qId];
        return next;
      });
    } else {
      const num = Math.max(0, Math.min(maxMarks, parseFloat(trimmed) || 0));
      // Remove from ungraded
      setUngradedSet((prev) => {
        const next = new Set(prev);
        next.delete(qId);
        return next;
      });
      setManualScores((prev) => ({ ...prev, [qId]: num }));
    }
  }

  // ── Question card renderer ─────────────────────────────────────────────

  function renderQuestionCard(q: QuestionData, i: number) {
    const opts = q.options;
    const ans = q.answer;
    const isManual = q.question_type === "SHORT_ANSWER" || q.question_type === "ESSAY";
    const isAlreadyGraded = ans?.score_awarded !== null && ans?.score_awarded !== undefined;

    // Parse answer_json for selected option IDs
    let selectedIds: Set<string> = new Set();
    if (ans?.answer_json) {
      try {
        const parsed = JSON.parse(ans.answer_json);
        if (Array.isArray(parsed)) {
          selectedIds = new Set(parsed.map(String));
        } else if (parsed !== null && parsed !== undefined) {
          selectedIds = new Set([String(parsed)]);
        }
      } catch {
        /* ignore */
      }
    }

    // Student's text answer (for SHORT_ANSWER/ESSAY)
    let studentTextAnswer = "";
    if (isManual && ans?.answer_json) {
      try {
        studentTextAnswer = typeof ans.answer_json === "string" ? ans.answer_json : "";
        const parsed = JSON.parse(ans.answer_json);
        if (typeof parsed === "string") studentTextAnswer = parsed;
      } catch {
        studentTextAnswer = ans.answer_json || "";
      }
    }

    // Live score display for manual questions in grade mode
    const liveGraded = !ungradedSet.has(q.id) && isManual && needsManualGrading;
    const displayScore = liveGraded
      ? manualScores[q.id] ?? ans?.score_awarded
      : ans?.score_awarded;
    const showGradedBadge = isAlreadyGraded || liveGraded;

    return (
      <div key={q.id} id={`q-${q.id}`}>
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <div className="flex gap-3 items-start">
            {/* Question number badge */}
            <div className="min-w-[32px] h-8 flex items-center justify-center rounded-full bg-teal-700 text-white text-sm font-bold flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              {/* Header row: type badge + marks */}
              <div className="flex gap-2 items-center mb-1 flex-wrap">
                <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">
                  {qTypeLabel(q.question_type)}
                </span>
                {showGradedBadge ? (
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      Number(displayScore) >= Number(q.marks)
                        ? "bg-green-50 text-green-700"
                        : Number(displayScore) > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                    }`}
                  >
                    {displayScore}/{q.marks}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 ml-auto">
                    {q.marks} mark{Number(q.marks) !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Question text */}
              <div className="text-sm mb-3 whitespace-pre-wrap">{q.question_text}</div>

              {/* MCQ / TRUE_FALSE / MULTIPLE_SELECT — option list */}
              {opts.length > 0 && (
                <div className="space-y-1 mb-3">
                  {opts.map((o) => {
                    const wasSelected = selectedIds.has(String(o.id));
                    const isCorrect = o.is_correct === 1;
                    const isMultipleSelect = q.question_type === "MULTIPLE_SELECT";

                    let bg = "bg-gray-50 border-gray-200";
                    let icon = "";
                    if (wasSelected && isCorrect) {
                      bg = "bg-green-50 border-green-200";
                      icon = "✓";
                    } else if (wasSelected && !isCorrect) {
                      bg = "bg-red-50 border-red-200";
                      icon = "✗";
                    } else if (isCorrect && isMultipleSelect) {
                      bg = "bg-amber-50 border-amber-200";
                      icon = "✓";
                    } else if (isCorrect) {
                      bg = "bg-green-50/50 border-green-100";
                      icon = "✓";
                    }

                    return (
                      <div
                        key={o.id}
                        className={`px-3 py-2 rounded-lg text-sm border ${bg} flex items-center gap-2`}
                      >
                        {icon && (
                          <span
                            className={`text-xs font-bold ${
                              icon === "✓" ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {icon}
                          </span>
                        )}
                        <span>{o.option_text}</span>
                        {wasSelected && (
                          <span className="font-semibold text-xs text-gray-500 ml-1">
                            ● selected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SHORT_ANSWER / ESSAY */}
              {isManual && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                    Student&apos;s answer
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm whitespace-pre-wrap min-h-[2rem]">
                    {studentTextAnswer || (
                      <span className="text-gray-400 italic">No answer provided</span>
                    )}
                  </div>

                  {/* Model answer */}
                  {q.model_answer && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                        Model answer
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {q.model_answer}
                      </div>
                    </div>
                  )}

                  {/* Grading inputs — only in grade mode */}
                  {needsManualGrading && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Score (max {q.marks})
                        </label>
                        <input
                          name={`score_${q.id}`}
                          type="number"
                          min="0"
                          max={q.marks}
                          step="0.5"
                          defaultValue={ans?.score_awarded ?? ""}
                          onChange={(e) =>
                            handleScoreChange(q.id, e.target.value, Number(q.marks))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Note (optional)
                        </label>
                        <input
                          name={`note_${q.id}`}
                          defaultValue={ans?.teacher_note || ""}
                          placeholder="Feedback"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Existing teacher note (view mode or already graded) */}
                  {(viewOnly || (isAlreadyGraded && !needsManualGrading)) &&
                    ans?.teacher_note && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">
                          Teacher note
                        </div>
                        <div className="text-sm">{ans.teacher_note}</div>
                      </div>
                    )}
                </div>
              )}

              {/* Approver comments section (view/approver mode only) */}
              {viewOnly && (
                <div className="space-y-2">
                  {/* Other approvers' comments */}
                  {q.otherComments.map((c, ci) => (
                    <div
                      key={ci}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                    >
                      <div className="text-xs text-gray-500 font-semibold mb-1">
                        {c.approver_name}
                      </div>
                      <div className="text-sm">{c.comment}</div>
                    </div>
                  ))}

                  {/* Own comment textarea (approver mode) */}
                  {isGradingApprover && (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-500 mb-1">
                        Your comment on this question (optional)
                      </label>
                      <textarea
                        name={`comment_${q.id}`}
                        defaultValue={q.myComment || ""}
                        rows={2}
                        placeholder="Add a comment…"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sidebar content ────────────────────────────────────────────────────

  function renderGradeSidebar() {
    return (
      <div className="space-y-3">
        {/* Needs Grading list */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <h3 className="font-bold text-sm mb-2">Needs Grading</h3>
          {ungradedManual.length === 0 ? (
            <p className="text-sm text-green-600">✅ All questions graded</p>
          ) : (
            <ul className="space-y-1">
              {ungradedManual.map((q) => (
                <li key={q.id}>
                  <a
                    href={`#q-${q.id}`}
                    className="text-sm text-teal-700 hover:underline no-underline block"
                  >
                    <span className="font-bold">Q{q.number}</span>{" "}
                    <span className="text-gray-500 text-xs">
                      {q.question_text.length > 30
                        ? q.question_text.slice(0, 30) + "…"
                        : q.question_text}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Live score total */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Score so far
          </div>
          <div className="text-xl font-bold">
            {liveScore}{" "}
            <span className="text-gray-400 font-normal">/ {scoreTotal}</span>
          </div>
        </div>

        {/* Desktop Save Grades button (inside form via nesting) */}
        <button
          type="submit"
          className="w-full px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
        >
          Save Grades
        </button>
      </div>
    );
  }

  function renderViewSidebar() {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <h3 className="font-bold text-sm mb-2">Score Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Score</span>
            <span className="font-semibold">
              {attempt.score_raw !== null
                ? `${attempt.score_raw} / ${attempt.score_total}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Percentage</span>
            <span className="font-semibold">
              {attempt.score_pct !== null
                ? `${Math.round(attempt.score_pct)}%`
                : "—"}
            </span>
          </div>
          {attempt.grade && (
            <div className="flex justify-between">
              <span className="text-gray-500">Grade</span>
              <span className="font-semibold">{attempt.grade}</span>
            </div>
          )}
          {attempt.pass_mark_percent !== null && attempt.score_pct !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Result</span>
              {attempt.score_pct >= attempt.pass_mark_percent ? (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">
                  Pass
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">
                  Fail
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Mobile FAB + drawer (grade mode only) ──────────────────────────────

  function renderMobileFAB() {
    if (!needsManualGrading) return null;

    const allGraded = ungradedManual.length === 0;

    return (
      <>
        {/* Floating action button */}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className={`md:hidden fixed bottom-4 right-4 z-40 px-4 py-3 text-white text-sm font-semibold rounded-full shadow-lg ${
            allGraded
              ? "bg-green-600 hover:bg-green-700"
              : "bg-teal-700 hover:bg-teal-800"
          }`}
        >
          {allGraded
            ? "✅ All Graded"
            : `📋 Needs Grading (${ungradedManual.length})`}
        </button>

        {/* Drawer */}
        {mobileDrawerOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/40 z-50"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="font-bold text-sm">
                  {allGraded
                    ? "✅ All Questions Graded"
                    : `Ungraded Questions (${ungradedManual.length})`}
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-2">
                {allGraded ? (
                  <p className="text-sm text-green-600 text-center py-4">
                    All questions have been scored. You can save your grades now.
                  </p>
                ) : (
                  ungradedManual.map((q) => (
                    <a
                      key={q.id}
                      href={`#q-${q.id}`}
                      onClick={() => setMobileDrawerOpen(false)}
                      className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm no-underline text-gray-700"
                    >
                      <span className="font-bold text-teal-700 mr-2">
                        Q{q.number}
                      </span>
                      <span className="text-gray-500">
                        {q.question_text.length > 60
                          ? q.question_text.slice(0, 60) + "…"
                          : q.question_text}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const questionCardsJSX = questions.map((q, i) => renderQuestionCard(q, i));

  return (
    <>
      {/* Banners */}
      {gateDecisionBanner}
      {approverBanner}
      {viewOnlyBanner}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
        {/* LEFT COLUMN — Questions */}
        <div>{questionCardsJSX}</div>

        {/* RIGHT SIDEBAR — desktop only */}
        <div className="hidden md:block">
          <div className="sticky top-4">
            {needsManualGrading ? renderGradeSidebar() : renderViewSidebar()}
          </div>
        </div>
      </div>

      {/* Mobile sticky save bar (grade mode) */}
      {needsManualGrading && (
        <div className="md:hidden sticky bottom-0 bg-white border-t border-gray-200 p-3 mt-3 rounded-b-xl">
          <button
            type="submit"
            className="w-full px-6 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800"
          >
            Save Grades
          </button>
        </div>
      )}

      {/* Mobile FAB + drawer */}
      {renderMobileFAB()}
    </>
  );
}
