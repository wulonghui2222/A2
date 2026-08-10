import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import bcrypt from 'bcryptjs';
import { prisma } from '~/a2/db.server';
import { getSessionUser, safeRedirectTo, signSession } from '~/a2/session.server';

// A2 (design D3, task 4.1): registration. UA-01: bcrypt hash, duplicate
// username rejection, length validation, auto-login on success.

const MIN_USERNAME = 3;
const MAX_USERNAME = 20;
const MIN_PASSWORD = 6;

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

  if (username.length < MIN_USERNAME || username.length > MAX_USERNAME) {
    return json({ error: `用户名长度需在 ${MIN_USERNAME}-${MAX_USERNAME} 个字符之间` });
  }

  if (password.length < MIN_PASSWORD) {
    return json({ error: `密码长度至少 ${MIN_PASSWORD} 位` });
  }

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    return json({ error: '用户名已被注册' });
  }

  const user = await prisma.user.create({
    data: {
      username,
      password: await bcrypt.hash(password, 10),
    },
  });

  // Auto-login: sign the session cookie and bounce to the original target.
  const cookie = await signSession(env, { id: user.id, username: user.username });

  return new Response(null, {
    status: 302,
    headers: { 'Set-Cookie': cookie, Location: redirectTo },
  });
}

export default function Register() {
  const actionData = useActionData<{ error?: string }>();
  const loaderData = useLoaderData<{ redirectTo?: string | null }>();
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  return (
    <div className="flex items-center justify-center h-full w-full bg-bolt-elements-background-depth-1">
      <div className="w-[360px] flex flex-col gap-6 p-8 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">注册</h1>
          <p className="text-sm text-bolt-elements-textSecondary">创建账号以使用 A2 工作台</p>
        </div>
        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="redirectTo" value={loaderData?.redirectTo ?? '/'} />
          <label className="flex flex-col gap-1 text-sm text-bolt-elements-textSecondary">
            用户名
            <input
              name="username"
              autoComplete="username"
              required
              minLength={MIN_USERNAME}
              maxLength={MAX_USERNAME}
              className="h-10 px-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bolt-elements-textSecondary">
            密码
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              className="h-10 px-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            />
          </label>
          {actionData?.error && <p className="text-sm text-red-500">{actionData.error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded-md bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
          >
            {submitting ? '注册中…' : '注册'}
          </button>
        </Form>
        <p className="text-sm text-bolt-elements-textSecondary">
          已有账号？
          <a className="text-bolt-elements-item-contentAccent" href="/login">
            去登录
          </a>
        </p>
      </div>
    </div>
  );
}
