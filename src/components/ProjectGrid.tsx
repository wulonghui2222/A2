"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfirmPopover } from "@/components/ConfirmPopover";

interface ProjectCard {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  updatedAt: string;
}

export function ProjectGrid({ projects }: { projects: ProjectCard[] }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(projects);

  const filtered = items.filter(
    (p) =>
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase())
  );

  const onDelete = async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setItems((prev) => prev.filter((p) => p.id !== id));
    }
  };

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索项目..."
          className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2.5 text-sm
                     focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">没有匹配的项目</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((project) => (
            <div key={project.id} className="relative group">
              <Link
                href={`/projects/${project.id}`}
                className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm
                           transition-all hover:shadow-md hover:border-indigo-200"
              >
                {/* Thumbnail */}
                <div className="aspect-video rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 
                                flex items-center justify-center mb-3 overflow-hidden">
                  {project.thumbnail ? (
                    <img
                      src={project.thumbnail}
                      alt={project.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🚀</span>
                  )}
                </div>
                <h3 className="font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                  {project.title}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(project.updatedAt).toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </Link>

              {/* Delete button — absolute top-right, hover-visible */}
              <div
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ConfirmPopover
                  triggerLabel="🗑"
                  triggerClassName="w-8 h-8 rounded-lg bg-white/90 hover:bg-red-50 border border-gray-200 text-sm flex items-center justify-center transition-colors shadow-sm"
                  confirmLabel="删除"
                  cancelLabel="取消"
                  message="确定删除此项目？此操作不可撤销。"
                  onConfirm={() => onDelete(project.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
