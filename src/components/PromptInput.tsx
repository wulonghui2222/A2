"use client";

import { useState } from "react";
import type { ModelEntry } from "@/lib/models";

interface PromptInputProps {
  onSubmit: (prompt: string, model: string) => void;
  disabled?: boolean;
  placeholder?: string;
  models?: ModelEntry[];
  defaultModel?: string;
}

export function PromptInput({
  onSubmit,
  disabled = false,
  placeholder = "描述你想要的项目...",
  models = [],
  defaultModel,
}: PromptInputProps) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel || models[0]?.id || "");

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit(value.trim(), selectedModel);
      setValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className="w-full rounded-2xl border border-gray-200 bg-white p-4 pr-36 
                   text-base shadow-sm transition-all
                   focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100
                   disabled:opacity-50 disabled:cursor-not-allowed
                   resize-none"
      />
      {/* Bottom-right controls: model selector + send button */}
      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        {models.length > 0 && (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs
                       text-gray-600 shadow-sm transition-all max-w-[140px]
                       focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="rounded-xl bg-indigo-600 p-2.5 
                     text-white shadow-md transition-all
                     hover:bg-indigo-700 active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
