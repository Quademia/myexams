// src/components/MobileGradingDrawer.tsx
// Floating action button + drawer overlay for mobile grading.
// Shows list of ungraded manual questions so the teacher can jump to them.

"use client";

import { useState } from "react";

interface UngradedQuestion {
  id: string;
  number: number;
  text: string;
}

interface MobileGradingDrawerProps {
  ungradedQuestions: UngradedQuestion[];
  totalUngraded: number;
}

export function MobileGradingDrawer({ ungradedQuestions, totalUngraded }: MobileGradingDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (totalUngraded === 0) return null;

  return (
    <>
      {/* Floating action button — bottom-right, hidden on desktop */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 px-4 py-3 bg-teal-700 text-white text-sm font-semibold rounded-full shadow-lg hover:bg-teal-800"
      >
        📋 {totalUngraded} to grade
      </button>

      {/* Overlay + drawer */}
      {isOpen && (
        <>
          {/* Dark overlay */}
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-50"
            onClick={() => setIsOpen(false)}
          />
          {/* Drawer sliding up from bottom */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-bold text-sm">Ungraded Questions ({totalUngraded})</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {ungradedQuestions.map((q) => (
                <a
                  key={q.id}
                  href={`#q-${q.id}`}
                  onClick={() => setIsOpen(false)}
                  className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm no-underline text-gray-700"
                >
                  <span className="font-bold text-teal-700 mr-2">Q{q.number}</span>
                  <span className="text-gray-500">{q.text.length > 60 ? q.text.slice(0, 60) + "…" : q.text}</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
