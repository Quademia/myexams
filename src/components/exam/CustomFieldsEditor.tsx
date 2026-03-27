"use client";
import { useState } from "react";

interface CustomField {
  tempId: string;
  label: string;
  type: string;
  options: string;
  required: boolean;
}

export function CustomFieldsEditor({
  initialFields,
}: {
  initialFields: {
    id: string;
    field_label: string;
    field_type: string;
    field_options: string | null;
    is_required: number;
  }[];
}) {
  const [fields, setFields] = useState<CustomField[]>(
    initialFields.map((f) => ({
      tempId: f.id,
      label: f.field_label,
      type: f.field_type,
      options: f.field_options || "",
      required: f.is_required === 1,
    }))
  );

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), label: "", type: "TEXT", options: "", required: false },
    ]);
  };

  const removeField = (tempId: string) => {
    setFields((prev) => prev.filter((f) => f.tempId !== tempId));
  };

  const updateField = (tempId: string, key: keyof CustomField, value: string | boolean) => {
    setFields((prev) =>
      prev.map((f) => (f.tempId === tempId ? { ...f, [key]: value } : f))
    );
  };

  return (
    <div>
      {fields.map((f) => (
        <div
          key={f.tempId}
          className="border border-gray-200 rounded-lg p-3 mb-2"
        >
          <div className="flex gap-2 items-start flex-wrap">
            <input
              name="cf_label[]"
              value={f.label}
              onChange={(e) => updateField(f.tempId, "label", e.target.value)}
              placeholder="Field label e.g. Index Number"
              className="flex-[2] px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[160px]"
            />
            <select
              name="cf_type[]"
              value={f.type}
              onChange={(e) => updateField(f.tempId, "type", e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[120px]"
            >
              <option value="TEXT">Text</option>
              <option value="NUMBER">Number</option>
              <option value="DROPDOWN">Dropdown</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm py-2">
              {f.required ? (
                <input
                  type="checkbox"
                  name="cf_required[]"
                  value="1"
                  checked
                  onChange={() => updateField(f.tempId, "required", false)}
                />
              ) : (
                <>
                  <input type="hidden" name="cf_required[]" value="0" />
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => updateField(f.tempId, "required", true)}
                  />
                </>
              )}
              Required
            </label>
            <button
              type="button"
              onClick={() => removeField(f.tempId)}
              className="px-2 py-2 text-gray-400 hover:text-red-600 text-sm"
            >
              ✕
            </button>
          </div>
          {f.type === "DROPDOWN" ? (
            <div className="mt-2">
              <input
                name="cf_options[]"
                value={f.options}
                onChange={(e) => updateField(f.tempId, "options", e.target.value)}
                placeholder="Comma-separated options"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          ) : (
            <input type="hidden" name="cf_options[]" value="" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addField}
        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
      >
        + Add field
      </button>
    </div>
  );
}
