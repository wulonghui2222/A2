import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProjectDetailShell } from "./ProjectDetailShell";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  const currentUserId = session?.user?.id;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sessions: {
        orderBy: { createdAt: "desc" },
        include: {
          messages: { orderBy: { timestamp: "asc" } },
        },
      },
    },
  });

  if (!project) notFound();

  const isOwner = currentUserId !== undefined && project.userId === currentUserId;
  const isPublic = project.isPublic;

  // Owner is redirected to the live workbench (design D4 / FR-05)
  if (isOwner) {
    redirect(`/workbench/${id}`);
  }

  // Non-owner can only view public projects
  if (!isPublic) {
    notFound();
  }

  // Increment viewCount for public projects (fire-and-forget)
  if (isPublic) {
    prisma.project
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {/* ignore */});
  }

  // Flatten sessions into a chronological message stream (with session boundaries)
  const messages = project.sessions.flatMap((s) =>
    s.messages.map((m) => ({
      id: m.id,
      sessionId: s.id,
      sessionStatus: s.status,
      agentRole: m.agentRole,
      content: m.content,
      type: m.type,
      timestamp: m.timestamp.toISOString(),
      metadata: m.metadata ? safeJson(m.metadata) : undefined,
    }))
  );

  // Sort messages chronologically across sessions
  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={isOwner ? "/my-projects" : "/gallery"}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0"
            >
              ← {isOwner ? "我的项目" : "项目画廊"}
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {project.title}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
              {project.status === "completed"
                ? "已完成"
                : project.status === "generating"
                  ? "生成中"
                  : project.status}
            </span>
            {isPublic && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                公开
              </span>
            )}
            <span className="text-xs text-gray-400 shrink-0">
              {project.viewCount} 次浏览
            </span>
          </div>

        </div>
      </header>

      <ProjectDetailShell
        project={{
          id: project.id,
          title: project.title,
          description: project.description,
          code: project.code,
          status: project.status,
          prompt: project.prompt,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        }}
        messages={messages}
        isOwner={isOwner}
      />

    </main>
  );
}

function safeJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}
