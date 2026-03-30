"use client";

// src/components/ui/LargeModal.tsx
// A large centred modal for rich content — exam question review,
// viewing a student's full attempt, etc. NOT a confirm dialog
// (those use ConfirmButton). The user can always see the workspace
// behind the darkened backdrop.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SIZE_CLASSES = {
  md: "max-w-2xl",
  lg: "max-w-3xl",
} as const;

interface LargeModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg";
  children: React.ReactNode;
}

export function LargeModal({
  open,
  onClose,
  title,
  subtitle,
  size = "lg",
  children,
}: LargeModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className={`w-full ${SIZE_CLASSES[size]} max-h-[88vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-base">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
