import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { prisma } from '~/a2/db.server';
import { getSessionUser } from '~/a2/session.server';
import { Header } from '~/components/header/Header';

/*
 * A2 project-plaza (PL-01): public plaza listing. No auth required; lists all
 * public projects sorted by viewCount desc. Cards show the captured runtime
 * screenshot when one exists (plaza-card-thumbnails PL-04), falling back to
 * the placeholder image.
 *
 * Lives under the `plaza.tsx` layout route (Remix flat-file nesting); the
 * detail view is `plaza.$urlId.tsx`.
 */

interface PlazaProject {
  id: string;
  urlId: string;
  description: string | null;
  viewCount: number;
  hasThumbnail: boolean;
  author: string | null;
}

export const meta = () => {
  return [{ title: '项目广场 - A2' }, { name: 'description', content: '浏览社区公开的项目' }];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  // Optional session: only used to show the "我的项目" entry when logged in.
  const user = await getSessionUser(request, env);

  const projects = await prisma.project.findMany({
    where: { isPublic: true },
    orderBy: { viewCount: 'desc' },
    select: { id: true, urlId: true, description: true, viewCount: true, thumbnail: true, user: { select: { username: true } } },
  });

  /*
   * D4: only a presence flag goes into the list payload; the base64 JPEG is
   * served separately by the thumbnail resource route (lazy <img>).
   */
  const mapped = projects.map(({ thumbnail, user, ...rest }) => ({
    ...rest,
    hasThumbnail: Boolean(thumbnail),
    author: user?.username ?? null,
  }));

  return json({ username: user?.username, projects: mapped as PlazaProject[] });
}

export default function PlazaIndex() {
  const { projects } = useLoaderData<{ username?: string; projects: PlazaProject[] }>();

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <Header />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">项目广场</h1>
          <a href="/" className="text-sm text-bolt-elements-item-contentAccent hover:underline">
            去创建项目
          </a>
        </div>
        <p className="text-sm text-bolt-elements-textSecondary mb-6">浏览社区公开的项目，共 {projects.length} 个</p>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-bolt-elements-textSecondary">
            <div className="i-ph:sparkle-duotone text-5xl text-bolt-elements-textTertiary" />
            <p>还没有公开的项目</p>
            <p className="text-xs text-bolt-elements-textTertiary">
              创建项目后，在「我的项目」中公开它，就会出现在这里
            </p>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {projects.map((project) => (
              <a
                key={project.urlId}
                href={`/plaza/${project.urlId}`}
                className="group rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-bolt-elements-item-contentAccent transition-colors block p-3"
              >
                {/* Captured screenshot when available; placeholder fallback (PL-01). */}
                <div className="aspect-video rounded-md overflow-hidden bg-gradient-to-br from-bolt-elements-background-depth-3 to-bolt-elements-background-depth-1 flex items-center justify-center mb-3">
                  {project.hasThumbnail ? (
                    <CardThumbnail projectId={project.id} alt={project.description || '未命名项目'} />
                  ) : (
                    <div className="i-ph:rocket-launch text-3xl text-bolt-elements-textTertiary" />
                  )}
                </div>
                <div className="truncate text-sm font-medium text-bolt-elements-textPrimary group-hover:text-bolt-elements-item-contentAccent transition-colors">
                  {project.description || '未命名项目'}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-bolt-elements-textTertiary">
                  {project.author ? (
                    <span className="flex items-center gap-1">
                      <span className="i-ph:user-circle" />
                      {project.author}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span>{project.viewCount} 次浏览</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/*
 * A2 plaza-card-thumbnails (task 6.1): lazy-loaded capture with a placeholder
 * fallback. onError covers stale flags (thumbnail deleted / upload raced) so
 * the card never shows a broken image.
 */
function CardThumbnail({ projectId, alt }: { projectId: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className="i-ph:rocket-launch text-3xl text-bolt-elements-textTertiary" />;
  }

  return (
    <img
      src={`/api/a2/projects/${projectId}/thumbnail`}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-top"
    />
  );
}
