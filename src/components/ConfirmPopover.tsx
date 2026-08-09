"use client";

import { useEffect, useRef, useState, useTransition } from "react";

interface ConfirmPopoverProps {
  /** Label shown on the trigger button */
  triggerLabel: string;
  /** Optional className for the trigger button */
  triggerClassName?: string;
  /** Label shown on the confirm (red) button */
  confirmLabel: string;
  /** Label shown on the cancel button */
  cancelLabel: string;
  /** The message displayed inside the popover */
  message: string;
  /** Called on confirm. May return a Promise; spinner is shown while pending */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmPopover({
  triggerLabel,
  triggerClassName,
  confirmLabel,
  cancelLabel,
  message,
  onConfirm,
}: ConfirmPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await onConfirm();
      } finally {
        setOpen(false);
      }
    });
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          triggerClassName ??
          "text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        }
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-lg p-4 animate-in fade-in"
        >
          <p className="text-sm text-gray-700 mb-4">{message}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "处理中..." : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
