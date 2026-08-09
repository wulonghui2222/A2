import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { GalleryView } from "./GalleryView";

export const dynamic = "force-dynamic";

interface GalleryProject {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  viewCount: number;
}

export default async function GalleryPage() {
  const rows = await prisma.project.findMany({
    where: { isPublic: true, status: "completed" },
    orderBy: { viewCount: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnail: true,
      tags: true,
      viewCount: true,
    },
  });

  // Parse tags JSON string and build tag aggregation
  const projects: GalleryProject[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    thumbnail: r.thumbnail,
    tags: safeParseTags(r.tags),
    viewCount: r.viewCount,
  }));

  // Aggregate tag counts across all projects
  const tagCounts = new Map<string, number>();
  for (const p of projects) {
    for (const t of p.tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const allTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A2</span>
            </div>
            <span className="font-semibold text-gray-900">Atoms</span>
          </Link>
          <nav className="flex items-center gap-4">
            <span className="text-sm text-indigo-600 font-medium">项目画廊</span>
            <Link
              href="/my-projects"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              我的项目
            </Link>
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              创建项目
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">项目画廊</h1>
        <p className="text-gray-500 mb-8">
          浏览社区公开的项目，共 {projects.length} 个
        </p>

        <GalleryView projects={projects} allTags={allTags} />
      </section>
    </main>
  );
}

function safeParseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
