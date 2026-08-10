import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import bcrypt from 'bcryptjs';
import { prisma } from '~/a2/db.server';
import { getSessionUser, safeRedirectTo, signSession } from '~/a2/session.server';

// A2 (design D3, task 4.2): login. UA-02: bcrypt verify, httpOnly JWT cookie,
// uniform failure message (no user/password distinction).

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  // UA-04: already logged in -> straight to the workbench.
  if (await getSessionUser(request, env)) {
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }

  const url = new URL(request.url);

  return json({ redirectTo: url.searchParams.get('redirectTo') });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const form = await request.formData();
  const username = String(form.get('username') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const redirectTo = safeRedirectTo(String(form.get('redirectTo') ?? '') || null);

  const fail = json({ error: '用户名或密码错误' });

  if (!username || !password) {
    return fail;
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return fail;
  }

  const cookie = await signSession(env, { id: user.id, username: user.username });

  return new Response(null, {
    status: 302,
    headers: { 'Set-Cookie': cookie, Location: redirectTo },
  });
}

export default function Login() {
  const actionData = useActionData<{ error?: string }>();
  const loaderData = useLoaderData<{ redirectTo?: string | null }>();
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  return (
    <div className="flex items-center justify-center h-full w-full bg-bolt-elements-background-depth-1">
      <div className="w-[360px] flex flex-col gap-6 p-8 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">登录</h1>
          <p className="text-sm text-bolt-elements-textSecondary">登录以进入 A2 工作台</p>
        </div>
        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="redirectTo" value={loaderData?.redirectTo ?? '/'} />
          <label className="flex flex-col gap-1 text-sm text-bolt-elements-textSecondary">
            用户名
            <input
              name="username"
              autoComplete="username"
              required
              className="h-10 px-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bolt-elements-textSecondary">
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-10 px-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            />
          </label>
          {actionData?.error && <p className="text-sm text-red-500">{actionData.error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded-md bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </Form>
        <p className="text-sm text-bolt-elements-textSecondary">
          还没有账号？
          <a className="text-bolt-elements-item-contentAccent" href="/register">
            去注册
          </a>
        </p>
      </div>
    </div>
  );
}
