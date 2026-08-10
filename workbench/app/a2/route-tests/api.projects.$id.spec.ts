import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '~/a2/db.fixture';
import { signSession } from '~/a2/session.server';

// A2 test-suite (TS-01): single-project CRUD routes against a throwaway DB.

let testDb: TestDb | undefined;

vi.mock('~/a2/db.server', () => ({
  get prisma() {
    return testDb!.prisma;
  },
}));

const ENV = { SESSION_SECRET: 'test-secret' };
const context = { cloudflare: { env: ENV } } as any;

let loader: typeof import('~/routes/api.projects.$id').loader;
let action: typeof import('~/routes/api.projects.$id').action;
let cookie = '';
let otherCookie = '';
let projectId = '';

const args = (method: string, id: string, body?: unknown, authCookie: string | null = cookie) => {
  const effectiveCookie = authCookie === null ? undefined : authCookie;

  return {
    params: { id },
    context,
    request: new Request(`http://localhost/api/projects/${id}`, {
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

  ({ loader, action } = await import('~/routes/api.projects.$id'));

  const owner = await testDb.prisma.user.create({ data: { username: 'crud-owner', password: 'hash' } });
  const stranger = await testDb.prisma.user.create({ data: { username: 'crud-stranger', password: 'hash' } });

  cookie = (await signSession(ENV, { id: owner.id, username: owner.username })).split(';')[0];
  otherCookie = (await signSession(ENV, { id: stranger.id, username: stranger.username })).split(';')[0];

  const project = await testDb.prisma.project.create({ data: { urlId: 'crud-project', userId: owner.id } });

  projectId = project.id;
}, 60_000);

afterAll(async () => {
  await testDb?.dispose();
});

describe('auth and ownership (WB-08)', () => {
  it('returns 401 without a session', async () => {
    const response = await loader(args('GET', projectId, undefined, null));

    expect(response.status).toBe(401);
  });

  it('returns 404 for unknown ids', async () => {
    const response = await loader(args('GET', 'nope'));

    expect(response.status).toBe(404);
  });

  it("returns 404 for another user's project", async () => {
    const response = await loader(args('GET', projectId, undefined, otherCookie));

    expect(response.status).toBe(404);
  });
});

describe('GET / PUT round-trip (WB-06)', () => {
  it('stores and returns the whole message list in order', async () => {
    const messages = [
      { id: 'm1', role: 'user', content: 'hello' },
      { id: 'm2', role: 'assistant', content: '[Model: x]\n\nworld' },
    ];

    const put = await action(args('PUT', projectId, { messages, description: '我的项目' }));

    expect(put.status).toBe(200);

    const get = await loader(args('GET', projectId));
    const detail = (await get.json()) as any;

    expect(detail.id).toBe(projectId);
    expect(detail.description).toBe('我的项目');
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(detail.messages[1].content).toContain('[Model: x]');
  });

  it('resolves the project by urlId as well as id', async () => {
    const response = await loader(args('GET', 'crud-project'));
    const detail = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(detail.id).toBe(projectId);
  });

  it('keeps stored messages on snapshot-only saves', async () => {
    await action(args('PUT', projectId, { fileSnapshot: JSON.stringify({ 'index.html': '<h1/>' }) }));

    const detail = (await (await loader(args('GET', projectId))).json()) as any;

    expect(detail.messages).toHaveLength(2);
    expect(detail.fileSnapshot).toBe(JSON.stringify({ 'index.html': '<h1/>' }));
  });

  it('rejects snapshots above the 2MB cap with 413', async () => {
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    const response = await action(args('PUT', projectId, { fileSnapshot: oversized }));

    expect(response.status).toBe(413);
  });

  it('returns 409 when the slug collides with another project', async () => {
    await testDb!.prisma.project.create({ data: { urlId: 'taken-slug', userId: 1 } });

    const response = await action(args('PUT', projectId, { urlId: 'taken-slug' }));

    expect(response.status).toBe(409);
  });

  it('returns 400 for invalid JSON', async () => {
    const response = await action({
      params: { id: projectId },
      context,
      request: new Request(`http://localhost/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{broken',
      }),
    } as any);

    expect(response.status).toBe(400);
  });
});

describe('DELETE', () => {
  it('removes the project (and cascades messages)', async () => {
    const response = await action(args('DELETE', projectId));

    expect(await response.json()).toEqual({ ok: true });

    expect((await loader(args('GET', projectId))).status).toBe(404);
    expect(await testDb!.prisma.message.count({ where: { projectId } })).toBe(0);
  });

  it('rejects unsupported methods with 405', async () => {
    const project = await testDb!.prisma.project.create({ data: { urlId: 'method-check', userId: 1 } });
    const response = await action(args('PATCH', project.id));

    expect(response.status).toBe(405);
  });
});
