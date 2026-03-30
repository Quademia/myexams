"use client";

// src/components/ui/DrawerShell.tsx
// Reusable right-side slide-in panel. Provides the container only —
// content is passed as children. Used for StudentDrawer, TeacherDrawer,
// gate settings, and any future drawer in the app.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const WIDTH_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
} as const;

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export function DrawerShell({
  open,
  onClose,
  title,
  subtitle,
  width = "md",
  children,
}: DrawerShellProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full ${WIDTH_CLASSES[width]} bg-white z-50 shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 flex items-start justify-between">
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
            aria-label="Close drawer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
