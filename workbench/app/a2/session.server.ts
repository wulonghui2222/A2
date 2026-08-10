import { SignJWT, jwtVerify } from 'jose';

// A2 (design D3, tasks 4.1-4.4): server-side session helpers.
// httpOnly JWT cookie, signed with SESSION_SECRET (server env only).

const COOKIE_NAME = 'a2_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: number;
  username: string;
}

function getSecret(env: Record<string, string | undefined>): Uint8Array {
  const secret = env.SESSION_SECRET;

  if (!secret) {
    // Local-only deployment (NFR-04): fall back to a dev secret so the app
    // stays bootable, but sessions are not trustworthy -- warn loudly.
    console.warn('[A2] SESSION_SECRET missing; using insecure dev fallback');

    return new TextEncoder().encode('a2-dev-insecure-secret');
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(env: Record<string, string | undefined>, user: SessionUser): Promise<string> {
  const token = await new SignJWT({ sub: String(user.id), username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret(env));

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getSessionUser(
  request: Request,
  env: Record<string, string | undefined>,
): Promise<SessionUser | undefined> {
  const cookies = request.headers.get('cookie');

  if (!cookies) {
    return undefined;
  }

  const token = cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (!token) {
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(env));

    if (!payload.sub) {
      return undefined;
    }

    return { id: Number(payload.sub), username: String(payload.username ?? '') };
  } catch {
    return undefined;
  }
}

/**
 * UA-04: unauthenticated access redirects to /login and bounces back to the
 * original target after login (redirectTo round-trip).
 */
export function loginRedirect(request: Request): Response {
  const url = new URL(request.url);
  const redirectTo = `${url.pathname}${url.search}`;

  return new Response(null, {
    status: 302,
    headers: { Location: `/login?redirectTo=${encodeURIComponent(redirectTo)}` },
  });
}

export async function requireUser(
  request: Request,
  env: Record<string, string | undefined>,
): Promise<SessionUser> {
  const user = await getSessionUser(request, env);

  if (!user) {
    // Throw-style redirect: callers return this response when not authenticated.
    throw loginRedirect(request);
  }

  return user;
}

/** Only relative targets are honored (open-redirect guard). */
export function safeRedirectTo(redirectTo: string | null | undefined, fallback = '/'): string {
  if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    return redirectTo;
  }

  return fallback;
}
