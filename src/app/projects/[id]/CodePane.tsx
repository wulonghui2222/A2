"use client";

import { useState } from "react";

export function CodePane({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  if (!code) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        暂无可展示的源代码
      </div>
    );
  }

  const lines = code.split("\n");

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
        <span className="text-xs text-gray-400 font-mono">index.html</span>
        <button
          onClick={onCopy}
          className="text-xs text-gray-300 hover:text-white transition-colors"
        >
          {copied ? "已复制 ✓" : "复制代码"}
        </button>
      </div>
      <div className="overflow-auto max-h-[calc(100vh-280px)]">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="font-mono text-xs leading-5 align-top">
                <td className="pl-4 pr-4 py-0 text-right text-gray-600 select-none w-12">
                  {i + 1}
                </td>
                <td className="pr-4 py-0 text-green-300 whitespace-pre">
                  {line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
