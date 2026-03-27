// src/components/ExamEngine.tsx
// Client component — the live exam-taking engine.
// Handles timer, autosave, question navigation, and submission.

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ───────────────────────────────────────────────────────────────

type Question = {
  id: string;
  question_type: string;
  question_text: string;
  marks: number;
  options: { id: string; option_text: string }[];
};

type ExamEngineProps = {
  attemptId: string;
  examTitle: string;
  navigationMode: "FREE" | "SEQUENTIAL";
  showMarksDuring: boolean;
  timeRemainingSecs: number;
  showDurationWarning: boolean;
  warningMins: number;
  questions: Question[];
  savedAnswers: Record<string, string | string[] | null>;
  savedFlags: Record<string, boolean>;
};

// ── Component ───────────────────────────────────────────────────────────

export function ExamEngine({
  attemptId,
  examTitle,
  navigationMode,
  showMarksDuring,
  timeRemainingSecs,
  showDurationWarning,
  warningMins,
  questions,
  savedAnswers,
  savedFlags,
}: ExamEngineProps) {
  // ── State ─────────────────────────────────────────────────────────────

  const [answers, setAnswers] = useState<Record<string, string | string[] | null>>(savedAnswers);
  const [flags, setFlags] = useState<Record<string, boolean>>(savedFlags);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secsLeft, setSecsLeft] = useState(timeRemainingSecs);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [gridView, setGridView] = useState<"all" | "flagged" | "unanswered">("all");
  const [mobileGridOpen, setMobileGridOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmittedRef = useRef(false);

  // Refs that track latest state for use inside callbacks/timers
  const answersRef = useRef(answers);
  const flagsRef = useRef(flags);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { flagsRef.current = flags; }, [flags]);

  // ── Helpers ───────────────────────────────────────────────────────────

  function setAnswer(qid: string, value: string | string[] | null) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  function toggleFlag(qid: string) {
    setFlags((prev) => ({ ...prev, [qid]: !prev[qid] }));
  }

  function isAnswered(qid: string): boolean {
    const a = answers[qid];
    if (a === null || a === undefined) return false;
    if (typeof a === "string") return a.trim() !== "";
    if (Array.isArray(a)) return a.length > 0;
    return false;
  }

  function fmtTime(s: number): string {
    s = Math.max(0, s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${m}:${pad(sec)}`;
  }

  const unansweredCount = questions.filter((q) => !isAnswered(q.id)).length;

  // ── Filtered question indices (for grid + prev/next cycling) ──────────

  function filteredIndices(): number[] {
    if (gridView === "all") return questions.map((_, i) => i);
    if (gridView === "flagged") return questions.map((q, i) => (flags[q.id] ? i : -1)).filter((i) => i !== -1);
    // unanswered
    return questions.map((q, i) => (!isAnswered(q.id) ? i : -1)).filter((i) => i !== -1);
  }

  // ── Save / submit ─────────────────────────────────────────────────────

  const doSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/attempt-take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_id: attemptId,
          action: "save",
          auto: false,
          answers: answersRef.current,
          flags: flagsRef.current,
        }),
      });
      const data = (await res.json()) as { ok?: boolean };
      setSaveStatus(data.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    }
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [attemptId]);

  async function doSubmit(auto = false) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/attempt-take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_id: attemptId,
          action: "submit",
          auto,
          answers: answersRef.current,
          flags: flagsRef.current,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; redirect?: string };
      if (data.ok && data.redirect) {
        window.location.href = data.redirect;
      }
    } catch {
      setSubmitting(false);
    }
  }

  function handleSubmitClick() {
    if (unansweredCount > 0) {
      if (!window.confirm(`You have ${unansweredCount} unanswered question(s). Submit anyway?`)) return;
    }
    doSubmit(false);
  }

  // ── Timer effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (secsLeft <= 0) {
      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        doSubmit(true);
      }
      return;
    }
    const interval = setInterval(() => {
      setSecsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            doSubmit(true);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave effect (every 30 s) ─────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(), 30000);
  }, [doSave]);

  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [answers, flags, scheduleSave]);

  // ── Navigation ────────────────────────────────────────────────────────

  function goPrev() {
    const indices = filteredIndices();
    const pos = indices.indexOf(currentIdx);
    if (pos > 0) setCurrentIdx(indices[pos - 1]);
    else if (currentIdx > 0) {
      // If current question is outside the filter, go to nearest previous in filter
      const prev = indices.filter((i) => i < currentIdx);
      if (prev.length > 0) setCurrentIdx(prev[prev.length - 1]);
    }
  }

  function goNext() {
    const indices = filteredIndices();
    const pos = indices.indexOf(currentIdx);
    if (pos >= 0 && pos < indices.length - 1) {
      setCurrentIdx(indices[pos + 1]);
    } else {
      // If current question is outside filter, go to nearest next in filter
      const next = indices.filter((i) => i > currentIdx);
      if (next.length > 0) setCurrentIdx(next[0]);
    }
  }

  // ── Current question ──────────────────────────────────────────────────

  const q = questions[currentIdx];
  if (!q) return null;

  const timerColor =
    secsLeft <= 60 ? "text-red-600" : secsLeft <= 300 ? "text-amber-600" : "text-green-700";

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Submitting overlay ─────────────────────────────────── */}
      {submitting && (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-bold">Submitting your exam…</div>
            <p className="text-sm text-gray-500 mt-2">Please wait, do not close this tab.</p>
          </div>
        </div>
      )}

      {/* ── Header bar (sticky) ────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold truncate max-w-[200px] sm:max-w-none">
          {examTitle}
        </h1>
        <div className="flex items-center gap-3">
          {/* Save status */}
          <span className="text-xs text-gray-400 hidden sm:inline">
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved ✓"}
            {saveStatus === "error" && <span className="text-red-500">Save failed</span>}
          </span>
          {/* Timer */}
          <span className={`font-mono text-sm font-bold ${timerColor}`}>
            {fmtTime(secsLeft)}
          </span>
        </div>
      </header>

      {/* ── Duration warning ───────────────────────────────────── */}
      {showDurationWarning && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2">
          <p className="text-xs text-amber-800 font-medium">
            ⚠️ Note: This exam closes soon. You have {warningMins} minute(s) available, not the full duration.
          </p>
        </div>
      )}

      {/* ── Main body ──────────────────────────────────────────── */}
      <div className="flex-1 flex">
        {/* ── Question panel ───────────────────────────────────── */}
        <div className={`flex-1 p-4 max-w-3xl ${navigationMode === "FREE" ? "lg:mr-64" : "mx-auto"}`}>
          {/* Question header */}
          <div className="mb-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-semibold uppercase">
              Question {currentIdx + 1} of {questions.length}
            </span>
            {showMarksDuring && (
              <span className="text-xs text-gray-400">[{q.marks} mark{q.marks !== 1 ? "s" : ""}]</span>
            )}
            {navigationMode === "FREE" && (
              <button
                onClick={() => toggleFlag(q.id)}
                className={`text-xs px-2 py-0.5 rounded ${flags[q.id] ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}
              >
                {flags[q.id] ? "🚩 Flagged" : "🏳️ Flag"}
              </button>
            )}
          </div>

          {/* Question text */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <p className="text-sm whitespace-pre-wrap">{q.question_text}</p>
          </div>

          {/* Answer input */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            {/* MCQ / TRUE_FALSE — radio buttons */}
            {(q.question_type === "MCQ" || q.question_type === "TRUE_FALSE") && (
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      answers[q.id] === opt.id
                        ? "border-teal-600 bg-teal-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q_${q.id}`}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswer(q.id, opt.id)}
                      className="accent-teal-700"
                    />
                    <span className="text-sm">{opt.option_text}</span>
                  </label>
                ))}
              </div>
            )}

            {/* MULTIPLE_SELECT — checkboxes */}
            {q.question_type === "MULTIPLE_SELECT" && (
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const selected: string[] = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                  const isChecked = selected.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? "border-teal-600 bg-teal-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const newArr = isChecked
                            ? selected.filter((id) => id !== opt.id)
                            : [...selected, opt.id];
                          setAnswer(q.id, newArr);
                        }}
                        className="accent-teal-700"
                      />
                      <span className="text-sm">{opt.option_text}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* SHORT_ANSWER */}
            {q.question_type === "SHORT_ANSWER" && (
              <input
                type="text"
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Type your answer…"
              />
            )}

            {/* ESSAY */}
            {q.question_type === "ESSAY" && (
              <textarea
                rows={6}
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                placeholder="Write your answer…"
              />
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              {navigationMode === "FREE" && (
                <button
                  onClick={goPrev}
                  disabled={currentIdx === 0}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
              )}

              {navigationMode === "SEQUENTIAL" && currentIdx === questions.length - 1 ? (
                <button
                  onClick={handleSubmitClick}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700"
                >
                  Submit Exam
                </button>
              ) : (
                <button
                  onClick={goNext}
                  disabled={currentIdx === questions.length - 1 && navigationMode === "FREE"}
                  className="px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              )}
            </div>

            {navigationMode === "FREE" && (
              <button
                onClick={handleSubmitClick}
                className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700"
              >
                Submit Exam
              </button>
            )}
          </div>
        </div>

        {/* ── Question grid sidebar (FREE mode, desktop) ────── */}
        {navigationMode === "FREE" && (
          <aside className="hidden lg:block fixed right-0 top-[49px] w-64 h-[calc(100vh-49px)] bg-white border-l border-gray-200 p-4 overflow-y-auto z-30">
            <GridPanel
              questions={questions}
              answers={answers}
              flags={flags}
              currentIdx={currentIdx}
              gridView={gridView}
              setGridView={setGridView}
              setCurrentIdx={setCurrentIdx}
              isAnswered={isAnswered}
              unansweredCount={unansweredCount}
            />
          </aside>
        )}
      </div>

      {/* ── Mobile grid button + drawer (FREE mode) ─────────── */}
      {navigationMode === "FREE" && (
        <>
          <button
            onClick={() => setMobileGridOpen(true)}
            className="lg:hidden fixed bottom-4 right-4 z-30 px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-full shadow-lg hover:bg-teal-800"
          >
            📋 Questions
          </button>

          {mobileGridOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              {/* backdrop */}
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileGridOpen(false)} />
              {/* drawer */}
              <div className="relative ml-auto w-72 bg-white h-full p-4 overflow-y-auto shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Questions</span>
                  <button
                    onClick={() => setMobileGridOpen(false)}
                    className="text-gray-400 hover:text-gray-600 text-lg"
                  >
                    ✕
                  </button>
                </div>
                <GridPanel
                  questions={questions}
                  answers={answers}
                  flags={flags}
                  currentIdx={currentIdx}
                  gridView={gridView}
                  setGridView={setGridView}
                  setCurrentIdx={(idx) => {
                    setCurrentIdx(idx);
                    setMobileGridOpen(false);
                  }}
                  isAnswered={isAnswered}
                  unansweredCount={unansweredCount}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Grid panel (shared between desktop sidebar and mobile drawer) ────────

function GridPanel({
  questions,
  answers,
  flags,
  currentIdx,
  gridView,
  setGridView,
  setCurrentIdx,
  isAnswered,
  unansweredCount,
}: {
  questions: Question[];
  answers: Record<string, string | string[] | null>;
  flags: Record<string, boolean>;
  currentIdx: number;
  gridView: "all" | "flagged" | "unanswered";
  setGridView: (v: "all" | "flagged" | "unanswered") => void;
  setCurrentIdx: (i: number) => void;
  isAnswered: (qid: string) => boolean;
  unansweredCount: number;
}) {
  // Filter buttons
  const filters: { key: "all" | "flagged" | "unanswered"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "flagged", label: "🚩 Flagged" },
    { key: "unanswered", label: "⬜ Unanswered" },
  ];

  // Determine visible indices
  const visibleIndices = questions.map((q, i) => {
    if (gridView === "all") return i;
    if (gridView === "flagged") return flags[q.id] ? i : -1;
    return !isAnswered(q.id) ? i : -1;
  }).filter((i) => i !== -1);

  const flaggedCount = questions.filter((q) => flags[q.id]).length;

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setGridView(f.key)}
            className={`text-xs px-2 py-1 rounded ${
              gridView === f.key
                ? "bg-teal-700 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary counts */}
      <div className="text-xs text-gray-500 mb-3 space-x-3">
        <span>{unansweredCount} unanswered</span>
        <span>{flaggedCount} flagged</span>
      </div>

      {/* Grid squares */}
      <div className="grid grid-cols-5 gap-1.5">
        {visibleIndices.map((idx) => {
          const qq = questions[idx];
          const answered = isAnswered(qq.id);
          const flagged = flags[qq.id];
          const isCurrent = idx === currentIdx;

          let bg = "bg-gray-200 text-gray-600"; // unanswered
          if (flagged) bg = "bg-orange-200 text-orange-800";
          if (answered && !flagged) bg = "bg-green-200 text-green-800";

          return (
            <button
              key={qq.id}
              onClick={() => setCurrentIdx(idx)}
              className={`w-full aspect-square rounded text-xs font-semibold flex items-center justify-center ${bg} ${
                isCurrent ? "ring-2 ring-teal-700 ring-offset-1" : ""
              } hover:opacity-80`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </>
  );
}
