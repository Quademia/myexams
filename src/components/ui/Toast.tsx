"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { Suspense } from "react";

// --- Toast types and styling ---

type ToastType = "success" | "error" | "info";

const TOAST_STYLES: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: "bg-green-600",   icon: "✓" },
  error:   { bg: "bg-red-600",     icon: "✕" },
  info:    { bg: "bg-teal-700",    icon: "ℹ" },
};

const AUTO_DISMISS_MS = 4000;

// --- Toast bubble ---

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}) {
  const { bg, icon } = TOAST_STYLES[type];

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-[9999] max-w-[320px]
        flex items-center gap-3 px-4 py-3
        rounded-lg shadow-lg text-white text-sm
        animate-slide-up ${bg}
      `}
    >
      {/* Type icon */}
      <span className="text-base font-bold leading-none">{icon}</span>

      {/* Message */}
      <span className="flex-1">{message}</span>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="ml-1 opacity-80 hover:opacity-100 text-base leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>

      {/* Inline keyframes — no globals.css edit needed */}
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

// --- Inner provider (needs useSearchParams, so wrapped in Suspense) ---

function ToastInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Read ?toast= and ?toast_type= on mount / URL change
  useEffect(() => {
    const message = searchParams.get("toast");
    if (!message) return;

    const rawType = searchParams.get("toast_type") || "success";
    const type: ToastType = ["success", "error", "info"].includes(rawType)
      ? (rawType as ToastType)
      : "success";

    setToast({ message, type });

    // Strip toast params from the URL so they don't linger
    const params = new URLSearchParams(searchParams.toString());
    params.delete("toast");
    params.delete("toast_type");
    const cleanUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    window.history.replaceState({}, "", cleanUrl);
  }, [searchParams, pathname]);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <Toast
      message={toast.message}
      type={toast.type}
      onDismiss={() => setToast(null)}
    />
  );
}

// --- Public export ---

export function ToastProvider() {
  return (
    <Suspense fallback={null}>
      <ToastInner />
    </Suspense>
  );
}
