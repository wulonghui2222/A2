"use client";

import { useState } from "react";
import { GalleryCard } from "./GalleryCard";

interface GalleryProject {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  viewCount: number;
}

interface TagInfo {
  tag: string;
  count: number;
}

export function GalleryView({
  projects,
  allTags,
}: {
  projects: GalleryProject[];
  allTags: TagInfo[];
}) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // AND logic: project must have ALL selected tags
  const filtered =
    selectedTags.size === 0
      ? projects
      : projects.filter((p) =>
          Array.from(selectedTags).every((t) => p.tags.includes(t))
        );

  return (
    <div>
      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {allTags.map(({ tag, count }) => {
            const active = selectedTags.has(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors
                  ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {tag}
                <span
                  className={`text-[10px] ${active ? "text-indigo-200" : "text-gray-400"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {selectedTags.size > 0 && (
            <button
              onClick={() => setSelectedTags(new Set())}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors ml-1"
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* Project grid */}
      {filtered.length === 0 ? (
        <p className="text-gray-500 py-16 text-center">
          {projects.length === 0
            ? "还没有公开的项目"
            : "没有匹配的项目，试试其他标签"}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((project) => (
            <GalleryCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
