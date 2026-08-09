"use client";

import { useState } from "react";

type Viewport = "desktop" | "tablet" | "phone";

const VIEWPORTS: Record<Viewport, { width: string; label: string; icon: string }> = {
  desktop: { width: "100%", label: "桌面", icon: "🖥️" },
  tablet: { width: "768px", label: "平板", icon: "📱" },
  phone: { width: "375px", label: "手机", icon: "📲" },
};

export function PreviewPane({ code, title }: { code: string; title: string }) {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  if (!code) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        暂无可预览的代码
      </div>
    );
  }

  return (
    <div>
      {/* Viewport switch */}
      <div className="flex justify-end mb-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {(Object.keys(VIEWPORTS) as Viewport[]).map((vp) => (
            <button
              key={vp}
              onClick={() => setViewport(vp)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewport === vp
                  ? "bg-gray-100 text-gray-900"
                  : "bg-white text-gray-400 hover:text-gray-600"
              }`}
              title={VIEWPORTS[vp].label}
            >
              {VIEWPORTS[vp].icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all duration-300"
          style={{ width: VIEWPORTS[viewport].width, maxWidth: "100%", height: "calc(100vh - 280px)", minHeight: 400 }}
        >
          <iframe
            srcDoc={code}
            sandbox="allow-scripts allow-forms"
            className="w-full h-full border-0"
            title={`Preview: ${title}`}
          />
        </div>
      </div>
    </div>
  );
}
