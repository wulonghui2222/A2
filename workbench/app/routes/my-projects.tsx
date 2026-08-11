import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { prisma } from '~/a2/db.server';
import { requireUser } from '~/a2/session.server';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Header } from '~/components/header/Header';

/*
 * A2 (design D4 / WB-07, task 5.x): "我的项目" page.
 * Server-rendered card grid of the current user's projects (updatedAt desc);
 * cards open the workbench chat, deletion goes through a confirmation dialog
 * and a Remix action (loader revalidation refreshes the list).
 */

interface ProjectCard {
  id: string;
  urlId: string;
  description: string | null;
  updatedAt: string;
  isPublic: boolean;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await requireUser(request, env);

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, urlId: true, description: true, updatedAt: true, isPublic: true },
  });

  return json({ username: user.username, projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await requireUser(request, env);

  const formData = await request.formData();

  if (formData.get('intent') !== 'delete') {
    return json({ error: 'Bad request.' }, { status: 400 });
  }

  const id = String(formData.get('id') ?? '');

  // Ownership first (WB-08): foreign ids look exactly like missing ones.
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!project) {
    return json({ error: '项目不存在或已被删除' }, { status: 404 });
  }

  await prisma.project.delete({ where: { id: project.id } });

  return json({ ok: true });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyProjects() {
  const { projects } = useLoaderData<{ username: string; projects: ProjectCard[] }>();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [deleting, setDeleting] = useState<ProjectCard | null>(null);
  const [submitted, setSubmitted] = useState(false);

  /*
   * Close the dialog once THIS delete submission round-trips. The `submitted`
   * flag matters: fetcher.data stays set after the first delete, so without it
   * every later dialog open would be closed instantly by this effect.
   */
  useEffect(() => {
    if (deleting && submitted && fetcher.state === 'idle') {
      setSubmitted(false);
      setDeleting(null);
    }
  }, [deleting, submitted, fetcher.state]);

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <Header />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">我的项目</h1>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
          >
            <div className="i-ph:plus text-base" />
            新建项目
          </a>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-bolt-elements-textSecondary">
            <div className="i-ph:folder-open-duotone text-5xl text-bolt-elements-textTertiary" />
            <p>你还没有任何项目</p>
            <a href="/" className="text-bolt-elements-item-contentAccent hover:underline">
              去工作台创建你的第一个项目
            </a>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group relative rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-bolt-elements-item-contentAccent transition-colors"
              >
                <a href={`/chat/${project.urlId}`} className="block p-3">
                  {/* Placeholder thumbnail: no screenshot pipeline in phase 1. */}
                  <div className="aspect-video rounded-md bg-gradient-to-br from-bolt-elements-background-depth-3 to-bolt-elements-background-depth-1 flex items-center justify-center mb-3">
                    <div className="i-ph:code text-3xl text-bolt-elements-textTertiary" />
                  </div>
                  <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                    {project.description || '未命名项目'}
                  </div>
                  <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                    更新于 {formatTime(project.updatedAt)}
                  </div>
                </a>
                <button
                  type="button"
                  title="删除项目"
                  className="absolute top-2 right-2 z-1 flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-button-danger-text hover:border-bolt-elements-button-danger-background transition-colors"
                  onClick={() => setDeleting(project)}
                >
                  <div className="i-ph:trash text-sm" />
                  删除
                </button>
                {/* A2 plaza-card-thumbnails (D7): publish moved to the workbench
                    header; the list only shows a read-only status line. */}
                {project.isPublic && (
                  <div className="flex items-center gap-1 border-t border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-icon-success">
                    <div className="i-ph:check-circle text-sm" />
                    已公开到广场
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogRoot open={deleting !== null}>
          <Dialog onBackdrop={() => setDeleting(null)} onClose={() => setDeleting(null)}>
            {deleting && (
              <>
                <DialogTitle>删除项目？</DialogTitle>
                <DialogDescription asChild>
                  <div>
                    <p>
                      即将删除 <strong>{deleting.description || '未命名项目'}</strong>。
                    </p>
                    <p className="mt-1">删除后无法恢复，确定要删除这个项目吗？</p>
                  </div>
                </DialogDescription>
                <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
                  {/* Cancel issues no request at all. */}
                  <DialogButton type="secondary" onClick={() => setDeleting(null)}>
                    取消
                  </DialogButton>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={deleting.id} />
                    <DialogButton type="danger" onClick={() => setSubmitted(true)}>
                      确认删除
                    </DialogButton>
                  </fetcher.Form>
                </div>
              </>
            )}
          </Dialog>
        </DialogRoot>
      </div>
    </div>
  );
}
