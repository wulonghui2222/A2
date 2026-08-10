import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { prisma } from '~/a2/db.server';
import { getSessionUser } from '~/a2/session.server';
import { Header } from '~/components/header/Header';

/*
 * A2 project-plaza (PL-01): public plaza listing. No auth required; lists all
 * public projects sorted by viewCount desc. Cards use a placeholder thumbnail
 * (no screenshot pipeline, see proposal Non-Goals).
 *
 * Lives under the `plaza.tsx` layout route (Remix flat-file nesting); the
 * detail view is `plaza.$urlId.tsx`.
 */

interface PlazaProject {
  urlId: string;
  description: string | null;
  viewCount: number;
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
    select: { urlId: true, description: true, viewCount: true },
  });

  return json({ username: user?.username, projects: projects as PlazaProject[] });
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
                {/* Placeholder thumbnail: no screenshot pipeline in this phase. */}
                <div className="aspect-video rounded-md bg-gradient-to-br from-bolt-elements-background-depth-3 to-bolt-elements-background-depth-1 flex items-center justify-center mb-3">
                  <div className="i-ph:rocket-launch text-3xl text-bolt-elements-textTertiary" />
                </div>
                <div className="truncate text-sm font-medium text-bolt-elements-textPrimary group-hover:text-bolt-elements-item-contentAccent transition-colors">
                  {project.description || '未命名项目'}
                </div>
                <div className="mt-1 text-xs text-bolt-elements-textTertiary">{project.viewCount} 次浏览</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
