"use client";

import { useState } from "react";
import Link from "next/link";

interface PreviewFrameProps {
  project: {
    id: string;
    title: string;
    description: string;
    code: string;
    status: string;
    prompt: string;
  };
}

type Viewport = "desktop" | "tablet" | "phone";

const VIEWPORT_SIZES: Record<Viewport, { width: string; label: string; icon: string }> = {
  desktop: { width: "100%", label: "Desktop", icon: "🖥️" },
  tablet: { width: "768px", label: "Tablet", icon: "📱" },
  phone: { width: "375px", label: "Phone", icon: "📲" },
};

export function PreviewFrame({ project }: PreviewFrameProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [view, setView] = useState<"preview" | "code">("preview");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
            >
              ← Back
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 truncate max-w-md">
              {project.title}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setView("preview")}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === "preview"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setView("code")}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === "code"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Code
              </button>
            </div>

            {/* Viewport Switcher */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(Object.keys(VIEWPORT_SIZES) as Viewport[]).map((vp) => (
                <button
                  key={vp}
                  onClick={() => setViewport(vp)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    viewport === vp
                      ? "bg-gray-100 text-gray-900"
                      : "bg-white text-gray-400 hover:text-gray-600"
                  }`}
                  title={VIEWPORT_SIZES[vp].label}
                >
                  {VIEWPORT_SIZES[vp].icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        {view === "preview" ? (
          <div className="h-full flex justify-center">
            <div
              className="h-[calc(100vh-140px)] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden transition-all duration-300"
              style={{ width: VIEWPORT_SIZES[viewport].width, maxWidth: "100%" }}
            >
              <iframe
                srcDoc={project.code}
                sandbox="allow-scripts allow-forms"
                className="w-full h-full border-0"
                title={`Preview: ${project.title}`}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <span className="text-xs text-gray-400 font-mono">index.html</span>
                <button
                  onClick={() => navigator.clipboard.writeText(project.code)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Copy
                </button>
              </div>
              <pre className="p-4 text-sm text-green-400 font-mono overflow-auto max-h-[calc(100vh-200px)]">
                <code>{project.code}</code>
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
