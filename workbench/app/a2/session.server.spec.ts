import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import {
  clearSessionCookie,
  getSessionUser,
  loginRedirect,
  requireUser,
  safeRedirectTo,
  signSession,
} from './session.server';

const ENV = { SESSION_SECRET: 'test-secret' };
const USER = { id: 7, username: 'tester' };

const requestWithCookie = (cookie: string | undefined, url = 'http://localhost/api/projects') =>
  new Request(url, { headers: cookie ? { cookie } : {} });

async function cookieHeader(env = ENV, user = USER, expiresIn = '1h'): Promise<string> {
  const token = await new SignJWT({ sub: String(user.id), username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(env.SESSION_SECRET));

  return `a2_session=${token}`;
}

describe('signSession', () => {
  it('produces an httpOnly cookie with a 7-day max age', async () => {
    const setCookie = await signSession(ENV, USER);

    expect(setCookie).toMatch(/^a2_session=[^;]+;/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain(`Max-Age=${60 * 60 * 24 * 7}`);
  });
});

describe('getSessionUser', () => {
  it('returns the user encoded in a valid session cookie', async () => {
    const request = requestWithCookie(await cookieHeader());

    expect(await getSessionUser(request, ENV)).toEqual(USER);
  });

  it('returns undefined without cookies', async () => {
    expect(await getSessionUser(requestWithCookie(undefined), ENV)).toBeUndefined();
  });

  it('returns undefined for unrelated cookies', async () => {
    expect(await getSessionUser(requestWithCookie('other=1'), ENV)).toBeUndefined();
  });

  it('rejects a token signed with a different secret', async () => {
    const cookie = await cookieHeader({ SESSION_SECRET: 'wrong-secret' });

    expect(await getSessionUser(requestWithCookie(cookie), ENV)).toBeUndefined();
  });

  it('rejects an expired token', async () => {
    const cookie = await cookieHeader(ENV, USER, '-1h');

    expect(await getSessionUser(requestWithCookie(cookie), ENV)).toBeUndefined();
  });

  it('rejects a garbage token', async () => {
    expect(await getSessionUser(requestWithCookie('a2_session=not-a-jwt'), ENV)).toBeUndefined();
  });

  it('falls back to the dev secret when SESSION_SECRET is missing', async () => {
    const noSecret: Record<string, string | undefined> = {};
    const token = await new SignJWT({ sub: '3', username: 'dev' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a2-dev-insecure-secret'));

    const user = await getSessionUser(requestWithCookie(`a2_session=${token}`), noSecret);

    expect(user).toEqual({ id: 3, username: 'dev' });
  });
});

describe('loginRedirect', () => {
  it('redirects to /login carrying the original path and query', () => {
    const response = loginRedirect(new Request('http://localhost/chat/abc?x=1'));

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/login?redirectTo=${encodeURIComponent('/chat/abc?x=1')}`);
  });
});

describe('requireUser', () => {
  it('returns the session user when authenticated', async () => {
    const request = requestWithCookie(await cookieHeader());

    expect(await requireUser(request, ENV)).toEqual(USER);
  });

  it('throws the login redirect response when anonymous', async () => {
    const request = requestWithCookie(undefined, 'http://localhost/chat/xyz');

    try {
      await requireUser(request, ENV);
      expect.unreachable('requireUser should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(302);
    }
  });
});

describe('safeRedirectTo', () => {
  it('honors relative targets', () => {
    expect(safeRedirectTo('/chat/1')).toBe('/chat/1');
  });

  it.each([
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['', '/'],
    [null, '/'],
    [undefined, '/'],
  ])('rejects %s and falls back', (input, fallback) => {
    expect(safeRedirectTo(input as string)).toBe(fallback);
  });

  it('uses the provided fallback', () => {
    expect(safeRedirectTo('https://x', '/my-projects')).toBe('/my-projects');
  });
});

describe('clearSessionCookie', () => {
  it('expires the session cookie immediately', () => {
    expect(clearSessionCookie()).toContain('a2_session=');
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});
