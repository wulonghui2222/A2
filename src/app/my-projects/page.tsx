import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProjectGrid } from "@/components/ProjectGrid";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/my-projects");
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

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
          <div className="flex items-center gap-4">
            <Link
              href="/gallery"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              项目广场
            </Link>
            <span className="text-sm text-indigo-600 font-medium">我的项目</span>
            <Link
              href="/"
              className="text-sm text-indigo-600 hover:underline"
            >
              创建新项目
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">我的项目</h1>
        <p className="text-gray-500 mb-8">
          共 {projects.length} 个项目
        </p>

        {projects.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-500 mb-4">还没有项目，去创建一个吧</p>
            <Link
              href="/"
              className="inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white
                         hover:bg-indigo-700 transition-colors"
            >
              创建项目 →
            </Link>
          </div>
        ) : (
          <ProjectGrid
            projects={projects.map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              thumbnail: p.thumbnail,
              updatedAt: p.updatedAt.toISOString(),
            }))}
          />
        )}
      </section>
    </main>
  );
}
