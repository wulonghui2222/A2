import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { isRouteErrorResponse, useLoaderData, useRouteError } from '@remix-run/react';
import { useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { prisma } from '~/a2/db.server';
import { PlazaVisitor } from '~/a2/plaza/PlazaVisitor.client';

/*
 * A2 project-plaza (D3/D4, task 4.2): public read-only detail view. No auth.
 * The loader resolves the project by urlId, 404s on non-public/missing (no
 * existence leakage), and atomically bumps viewCount (PL-03). The file
 * snapshot is deliberately NOT inlined here; the client pulls it on demand via
 * the /api/a2/plaza/$urlId/snapshot resource route so the HTML stays small.
 */

export const meta = () => {
  return [{ title: '项目详情 - A2' }, { name: 'description', content: '体验公开的项目' }];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const urlId = params.urlId;

  if (!urlId) {
    throw json({ error: 'Not Found' }, { status: 404 });
  }

  const project = await prisma.project.findFirst({
    where: { urlId, isPublic: true },
    select: { id: true, description: true, fileSnapshot: true, user: { select: { username: true } } },
  });

  if (!project) {
    throw json({ error: 'Not Found' }, { status: 404 });
  }

  // Atomic increment; the returned count is the post-increment value (PL-03).
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });

  return json({
    urlId,
    description: project.description,
    viewCount: updated.viewCount,
    hasSnapshot: Boolean(project.fileSnapshot),
    author: project.user?.username ?? null,
  });
}

export default function PlazaDetail() {
  const { urlId, description, viewCount, hasSnapshot, author } = useLoaderData<typeof loader>();
  const [showFiles, setShowFiles] = useState(false);

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <div className="flex items-center gap-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2.5">
        <a
          href="/plaza"
          className="flex items-center gap-1 text-sm text-bolt-elements-item-contentAccent hover:underline"
        >
          <span className="i-ph:arrow-left" />
          返回广场
        </a>
        <div className="h-4 w-px bg-bolt-elements-borderColor" />
        <div className="truncate text-sm font-medium text-bolt-elements-textPrimary">{description || '未命名项目'}</div>
        {author && (
          <div className="flex items-center gap-1 text-xs text-bolt-elements-textTertiary">
            <span className="i-ph:user-circle" />
            {author}
          </div>
        )}
        {hasSnapshot && (
          <button
            type="button"
            onClick={() => setShowFiles((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:border-bolt-elements-item-contentAccent transition-colors"
          >
            <span className={showFiles ? 'i-ph:eye-slash' : 'i-ph:code'} />
            {showFiles ? '隐藏代码' : '查看代码'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 text-xs text-bolt-elements-textTertiary">
          <span className="i-ph:eye" />
          {viewCount} 次浏览
        </div>
      </div>

      {/* A2 project-plaza (task 4.5): public but no snapshot -> friendly hint. */}
      {!hasSnapshot ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-bolt-elements-textSecondary">
          <div className="i-ph:image-square-duotone text-5xl text-bolt-elements-textTertiary" />
          <p>这个项目还没有可预览的版本</p>
          <p className="text-xs text-bolt-elements-textTertiary">项目所有者保存后，这里才会展示运行效果</p>
        </div>
      ) : (
        <ClientOnly fallback={<VisitorLoading />}>{() => <PlazaVisitor urlId={urlId} showFiles={showFiles} />}</ClientOnly>
      )}
    </div>
  );
}

function VisitorLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-bolt-elements-textSecondary">
      <div className="i-ph:spinner-bold animate-spin text-4xl text-bolt-elements-item-contentAccent" />
      <p>正在加载项目…</p>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary">
      <div className="i-ph:ghost-duotone text-5xl text-bolt-elements-textTertiary" />
      <p className="text-base font-medium text-bolt-elements-textPrimary">
        {notFound ? '项目不存在或未公开' : '页面出错了'}
      </p>
      <p className="text-xs text-bolt-elements-textTertiary">
        {notFound ? '它可能已被取消公开，或者链接有误' : '请稍后再试'}
      </p>
      <a href="/plaza" className="mt-2 text-sm text-bolt-elements-item-contentAccent hover:underline">
        返回项目广场
      </a>
    </div>
  );
}
