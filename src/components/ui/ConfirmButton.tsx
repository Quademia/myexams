"use client";

import { useRef, useState } from "react";

interface ConfirmButtonProps {
  label: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
  formAction: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
}

export function ConfirmButton({
  label,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  formAction,
  fields,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const triggerClass =
    variant === "danger"
      ? "text-red-600 hover:text-red-800"
      : "text-amber-600 hover:text-amber-800";

  const confirmBtnClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-amber-500 text-white hover:bg-amber-600";

  return (
    <>
      {/* Trigger button — type="button" prevents parent form submission */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-sm ${triggerClass}`}
      >
        {label}
      </button>

      {/* Hidden form — submitted programmatically on confirm */}
      <form ref={formRef} action={formAction} className="hidden">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-900">Are you sure?</h3>
            <p className="text-sm text-gray-600 mt-2 mb-6">{message}</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  formRef.current?.requestSubmit();
                }}
                className={`px-4 py-2 text-sm rounded-lg ${confirmBtnClass}`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
