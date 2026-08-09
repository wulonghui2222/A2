"use client";

import { useState } from "react";
import { PreviewPane } from "./PreviewPane";
import { CodePane } from "./CodePane";
import { SessionsPane } from "./SessionsPane";

type TabId = "preview" | "code" | "sessions";

export interface DetailProject {
  id: string;
  title: string;
  description: string;
  code: string;
  status: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DetailMessage {
  id: string;
  sessionId: string;
  sessionStatus: string;
  agentRole: string;
  content: string;
  type: string;
  timestamp: string;
  metadata?: unknown;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "preview", label: "预览" },
  { id: "code", label: "源代码" },
  { id: "sessions", label: "会话历史" },
];

export function ProjectDetailShell({
  project,
  messages,
  isOwner: _isOwner = true,
}: {
  project: DetailProject;
  messages: DetailMessage[];
  isOwner?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("preview");

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Meta bar */}
      <div className="mb-4 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
        <span>提示词：<span className="text-gray-700">{project.prompt}</span></span>
        <span>
          创建：
          {new Date(project.createdAt).toLocaleString("zh-CN")}
        </span>
        <span>
          更新：
          {new Date(project.updatedAt).toLocaleString("zh-CN")}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "preview" && <PreviewPane code={project.code} title={project.title} />}
      {tab === "code" && <CodePane code={project.code} />}
      {tab === "sessions" && <SessionsPane messages={messages} />}
    </div>
  );
}
