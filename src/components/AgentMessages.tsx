"use client";

import type { AgentMessage } from "@/lib/types";

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: string }
> = {
  pm: { label: "项目经理", color: "text-blue-700", bg: "bg-blue-50", icon: "📋" },
  architect: { label: "架构师", color: "text-purple-700", bg: "bg-purple-50", icon: "🏗️" },
  engineer: { label: "工程师", color: "text-green-700", bg: "bg-green-50", icon: "⚡" },
  system: { label: "System", color: "text-gray-700", bg: "bg-gray-50", icon: "🔧" },
  user: { label: "You", color: "text-orange-700", bg: "bg-orange-50", icon: "👤" },
};

interface AgentMessagesProps {
  messages: AgentMessage[];
}

export function AgentMessages({ messages }: AgentMessagesProps) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3 w-full max-w-2xl mx-auto">
      {messages.map((msg) => {
        const config = ROLE_CONFIG[msg.agentRole] || ROLE_CONFIG.system;
        return (
          <div key={msg.id} className="animate-fadeIn">
            <div
              className={`rounded-xl border border-gray-100 ${config.bg} p-4 shadow-sm`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{config.icon}</span>
                <span className={`text-sm font-semibold ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                {msg.type === "error" && (
                  <span className="ml-auto text-xs text-red-500 font-medium">Error</span>
                )}
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
