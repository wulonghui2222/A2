"use client";

import type { DetailMessage } from "./ProjectDetailShell";

const ROLE_META: Record<string, { label: string; avatar: string; color: string }> = {
  pm: { label: "PM Agent", avatar: "📋", color: "bg-blue-100 text-blue-800" },
  architect: { label: "Architect Agent", avatar: "🏗️", color: "bg-purple-100 text-purple-800" },
  engineer: { label: "Engineer Agent", avatar: "⚙️", color: "bg-amber-100 text-amber-800" },
  system: { label: "System", avatar: "🤖", color: "bg-gray-100 text-gray-700" },
  assistant: { label: "助手", avatar: "🤖", color: "bg-indigo-100 text-indigo-800" },
  user: { label: "You", avatar: "👤", color: "bg-emerald-100 text-emerald-800" },
};

export function SessionsPane({ messages }: { messages: DetailMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        暂无会话记录
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
      {messages.map((m) => {
        const meta = ROLE_META[m.agentRole] ?? ROLE_META.system;
        return (
          <div key={m.id} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="text-2xl shrink-0">{meta.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                    {meta.label}
                  </span>
                  {m.type !== "text" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {m.type}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto shrink-0">
                    {new Date(m.timestamp).toLocaleString("zh-CN")}
                  </span>
                </div>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words font-sans leading-relaxed">
                  {m.content}
                </pre>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
