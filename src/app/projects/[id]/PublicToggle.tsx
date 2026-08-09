"use client";

import { useState, useTransition } from "react";

interface PublicToggleProps {
  projectId: string;
  isPublic: boolean;
  status: string;
}

export function PublicToggle({ projectId, isPublic, status }: PublicToggleProps) {
  const [checked, setChecked] = useState(isPublic);
  const [isPending, startTransition] = useTransition();
  const isDisabled = status !== "completed";

  const handleToggle = () => {
    if (isDisabled) return;
    const next = !checked;
    setChecked(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: next }),
        });
        if (!res.ok) {
          // Revert on failure
          setChecked(!next);
        }
      } catch {
        setChecked(!next);
      }
    });
  };

  return (
    <div className="flex items-center gap-2" title={isDisabled ? "仅已完成的项目可以公开" : undefined}>
      <span className="text-xs text-gray-500">{checked ? "公开" : "私有"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={isDisabled || isPending}
        onClick={handleToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          disabled:cursor-not-allowed disabled:opacity-40
          ${checked ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow
            ring-0 transition duration-200 ease-in-out
            ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
