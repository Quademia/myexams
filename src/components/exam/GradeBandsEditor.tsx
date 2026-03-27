"use client";
import { useState } from "react";

interface Band {
  tempId: string;
  label: string;
  min_percent: string;
}

export function GradeBandsEditor({
  initialBands,
}: {
  initialBands: { id: string; label: string; min_percent: number }[];
}) {
  const [bands, setBands] = useState<Band[]>(
    initialBands.map((b) => ({
      tempId: b.id,
      label: b.label,
      min_percent: String(b.min_percent),
    }))
  );

  const addBand = () => {
    setBands((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), label: "", min_percent: "" },
    ]);
  };

  const removeBand = (tempId: string) => {
    setBands((prev) => prev.filter((b) => b.tempId !== tempId));
  };

  const updateBand = (tempId: string, field: "label" | "min_percent", value: string) => {
    setBands((prev) =>
      prev.map((b) => (b.tempId === tempId ? { ...b, [field]: value } : b))
    );
  };

  return (
    <div>
      {bands.map((b) => (
        <div
          key={b.tempId}
          className="flex gap-2 items-center mb-2"
        >
          <input
            name="band_label[]"
            value={b.label}
            onChange={(e) => updateBand(b.tempId, "label", e.target.value)}
            placeholder="e.g. Distinction"
            className="flex-[2] px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-0"
          />
          <input
            name="band_min[]"
            type="number"
            min={0}
            max={100}
            value={b.min_percent}
            onChange={(e) => updateBand(b.tempId, "min_percent", e.target.value)}
            placeholder="Min %"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[80px]"
          />
          <button
            type="button"
            onClick={() => removeBand(b.tempId)}
            className="px-2 py-2 text-gray-400 hover:text-red-600 text-sm"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addBand}
        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
      >
        + Add grade band
      </button>
    </div>
  );
}
