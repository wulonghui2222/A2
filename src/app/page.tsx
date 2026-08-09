"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGenerationStore } from "@/lib/store";
import { PromptInput } from "@/components/PromptInput";
import { AgentMessages } from "@/components/AgentMessages";
import { MODEL_CATALOG, DEFAULT_MODEL_ID } from "@/lib/models";

export default function HomePage() {
  const router = useRouter();
  const {
    isGenerating,
    projectId,
    status,
    progress,
    messages,
    error,
    startGeneration,
    reset,
  } = useGenerationStore();

  const handleGenerate = async (prompt: string, model: string) => {
    await startGeneration(prompt, model);
  };

  const handleViewProject = () => {
    if (projectId) {
      router.push(`/projects/${projectId}`);
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
      {!isGenerating && messages.length === 0 && (
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            用AI构建你的下一个项目
          </h1>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
            AI Agent 团队自动协作，将你的想法转化为可运行的 Web 应用
          </p>

          <PromptInput
            onSubmit={handleGenerate}
            models={MODEL_CATALOG}
            defaultModel={DEFAULT_MODEL_ID}
          />

          {/* Agent Team Intro */}
          <div className="mt-16 flex items-center justify-center gap-4 flex-wrap">
            <span className="text-sm text-gray-400">你的AI Agent团队</span>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">📋</span>
              项目经理
            </div>
            <span className="text-gray-300">→</span>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">🏗️</span>
              架构师
            </div>
            <span className="text-gray-300">→</span>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">⚡</span>
              工程师
            </div>
          </div>
        </section>
      )}

      {/* Generation Progress */}
      {(isGenerating || messages.length > 0) && (
        <section className="max-w-4xl mx-auto px-6 py-12">
          {/* Progress Bar */}
          {isGenerating && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  正在生成项目...
                </span>
                <span className="text-sm text-gray-500">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">生成失败：{error}</p>
              <button
                onClick={reset}
                className="mt-2 text-sm text-red-600 underline hover:text-red-800"
              >
                重试
              </button>
            </div>
          )}

          {/* Agent Messages */}
          <AgentMessages messages={messages} />

          {/* Completion Actions */}
          {status === "completed" && projectId && (
            <div className="mt-8 text-center">
              <button
                onClick={handleViewProject}
                className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium
                         hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                查看生成的项目 →
              </button>
              <button
                onClick={reset}
                className="ml-4 px-6 py-3 rounded-xl border border-gray-200 text-gray-600
                         hover:bg-gray-50 transition-all"
              >
                创建新项目
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
