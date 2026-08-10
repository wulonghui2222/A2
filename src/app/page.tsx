"use client";

import Link from "next/link";
import { useState } from "react";
import { PromptInput } from "@/components/PromptInput";

/**
 * Home page (FR-01, bolt-rewrite): the prompt creates a project shell via
 * POST /api/projects, then hands off to the embedded bolt workbench where
 * generation actually happens (with bolt's own provider settings). No
 * server-side pipeline / polling / model selection here.
 */
export default function HomePage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (prompt: string, _model: string) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (response.status === 401) {
        window.location.href = "/login?callbackUrl=/";
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "创建项目失败");
      }

      const data = await response.json();
      // Hard navigation: /workbench/:id carries route-scoped COEP/COOP
      // headers, which only take effect on a full document load — an SPA
      // router.push would keep the non-isolated browsing context.
      window.location.assign(`/workbench/${data.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A2</span>
            </div>
            <span className="font-semibold text-gray-900">Atoms</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/gallery"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              项目画廊
            </Link>
            <Link
              href="/my-projects"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              我的项目
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          用AI构建你的下一个项目
        </h1>
        <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
          描述你的想法，在生成工作台中实时预览并迭代，一键保存为你的项目
        </p>

        <PromptInput onSubmit={handleGenerate} disabled={submitting} />

        {submitting && (
          <p className="mt-4 text-sm text-gray-500">正在打开生成工作台…</p>
        )}

        {error && (
          <div className="mt-4 max-w-xl mx-auto rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </section>
    </main>
  );
}
