import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '~/a2/db.fixture';
import { signSession } from '~/a2/session.server';

// A2 test-suite (TS-01): WB-10 owner-only public visibility toggle.

let testDb: TestDb | undefined;

vi.mock('~/a2/db.server', () => ({
  get prisma() {
    return testDb!.prisma;
  },
}));

const ENV = { SESSION_SECRET: 'test-secret' };
const context = { cloudflare: { env: ENV } } as any;

let action: typeof import('~/routes/api.a2.projects.$id.visibility').action;
let cookie = '';
let otherCookie = '';
let projectId = '';

const args = (method: string, body?: unknown, authCookie: string | null = cookie) => {
  const effectiveCookie = authCookie === null ? undefined : authCookie;

  return {
    params: { id: projectId },
    context,
    request: new Request(`http://localhost/api/a2/projects/${projectId}/visibility`, {
      method,
      headers: {
        ...(effectiveCookie ? { cookie: effectiveCookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  } as any;
};

beforeAll(async () => {
  testDb = await createTestDb();

  ({ action } = await import('~/routes/api.a2.projects.$id.visibility'));

  const owner = await testDb.prisma.user.create({ data: { username: 'vis-owner', password: 'hash' } });
  const stranger = await testDb.prisma.user.create({ data: { username: 'vis-stranger', password: 'hash' } });

  cookie = (await signSession(ENV, { id: owner.id, username: owner.username })).split(';')[0];
  otherCookie = (await signSession(ENV, { id: stranger.id, username: stranger.username })).split(';')[0];

  const project = await testDb.prisma.project.create({ data: { urlId: 'vis-project', userId: owner.id } });

  projectId = project.id;
}, 60_000);

afterAll(async () => {
  await testDb?.dispose();
});

describe('visibility toggle (WB-10)', () => {
  it('requires authentication', async () => {
    const response = await action(args('POST', { isPublic: true }, null));

    expect(response.status).toBe(401);
  });

  it('rejects non-POST methods', async () => {
    const response = await action(args('GET'));

    expect(response.status).toBe(405);
  });

  it("hides other users' projects behind a 404", async () => {
    const response = await action(args('POST', { isPublic: true }, otherCookie));

    expect(response.status).toBe(404);
  });

  it('refuses to publish without a file snapshot', async () => {
    const response = await action(args('POST', { isPublic: true }));
    const body = (await response.json()) as any;

    expect(response.status).toBe(409);
    expect(body.error).toContain('快照');

    const project = await testDb!.prisma.project.findUnique({ where: { id: projectId } });

    expect(project!.isPublic).toBe(false);
  });

  it('publishes once a snapshot exists and can unpublish again', async () => {
    await testDb!.prisma.project.update({
      where: { id: projectId },
      data: { fileSnapshot: JSON.stringify({ 'index.html': '<h1/>' }) },
    });

    const published = (await (await action(args('POST', { isPublic: true }))).json()) as any;

    expect(published.isPublic).toBe(true);

    const unpublished = (await (await action(args('POST', { isPublic: false }))).json()) as any;

    expect(unpublished.isPublic).toBe(false);
  });

  it('resolves the project by urlId too', async () => {
    const response = await action({
      ...args('POST', { isPublic: true }),
      params: { id: 'vis-project' },
    } as any);

    expect(response.status).toBe(200);

    // Restore private state for other tests.
    await action(args('POST', { isPublic: false }));
  });

  it('returns 400 for invalid JSON bodies', async () => {
    const response = await action({
      params: { id: projectId },
      context,
      request: new Request(`http://localhost/api/a2/projects/${projectId}/visibility`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{broken',
      }),
    } as any);

    expect(response.status).toBe(400);
  });
});
