import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { requireUser } from '~/a2/session.server';

export const meta: MetaFunction = () => {
  // A2: platform branding replaces the upstream bolt.diy title.
  return [{ title: 'A2' }, { name: 'description', content: '用AI构建你的下一个项目' }];
};

// A2 (task 4.4): the workbench requires a session; unauthenticated requests
// are bounced to /login with a redirectTo round-trip.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await requireUser(request, env);

  return json({ username: user.username });
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
