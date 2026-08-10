import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WORKBENCH_ORIGIN, workbenchSrc } from "@/lib/workbench-config";
import { WorkbenchClient } from "./WorkbenchClient";
import { DeleteProjectButton } from "@/app/projects/[id]/DeleteProjectButton";
import { PublicToggle } from "@/app/projects/[id]/PublicToggle";
import { deleteProjectAction } from "@/app/projects/[id]/actions";

export const dynamic = "force-dynamic";

/**
 * /workbench/:projectId — embeds the bolt fork workbench iframe.
 *
 * Owner-only (anonymous / non-owner get 404, matching /projects/:id).
 * This route alone carries COEP/COOP (next.config.ts headers) so the iframe
 * can be cross-origin-isolated; keep this page free of external resources
 * without CORP (design D2 / R2).
 */
export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await auth();
  const currentUserId = session?.user?.id;
  if (!currentUserId) notFound();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== currentUserId) notFound();

  // New project: hand the initial prompt over to the workbench (WE-03).
  // Once the workbench reports its chat urlId, reloads resume that chat
  // instead of starting a fresh one (which would regenerate the project).
  const isNew = project.status === "generating" && !project.files && !project.workbenchChatId;
  const src = workbenchSrc(project.id, {
    chatId: project.workbenchChatId ?? undefined,
    prompt: isNew ? project.prompt : undefined,
  });

  return (
    <main className="h-screen flex flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white shrink-0">
        <div className="px-4 py-2 flex items-center gap-3 min-w-0">
          <Link
            href="/my-projects"
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0"
          >
            ← 我的项目
          </Link>
          <h1 className="text-sm font-semibold text-gray-900 truncate">
            {project.title}
          </h1>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <PublicToggle
              projectId={project.id}
              isPublic={project.isPublic}
              status={project.status}
            />
            <DeleteProjectButton
              projectId={project.id}
              deleteAction={deleteProjectAction}
            />
          </div>
        </div>
      </header>
      <WorkbenchClient
        projectId={project.id}
        src={src}
        isNew={isNew}
        prompt={isNew ? project.prompt : undefined}
        workbenchOrigin={WORKBENCH_ORIGIN}
        userId={currentUserId}
        displayName={session.user.name ?? undefined}
        projectTitle={project.title}
      />
    </main>
  );
}
