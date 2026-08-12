import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '~/a2/db.fixture';
import { signSession } from '~/a2/session.server';

/*
 * A2 test-suite (TS-01, design D1): route handlers run against a throwaway
 * SQLite database; the mocked db.server module is wired to it after setup.
 */

let testDb: TestDb | undefined;

vi.mock('~/a2/db.server', () => ({
  get prisma() {
    return testDb!.prisma;
  },
}));

const ENV = { SESSION_SECRET: 'test-secret' };
const context = { cloudflare: { env: ENV } } as any;

let loader: typeof import('~/routes/api.projects').loader;
let action: typeof import('~/routes/api.projects').action;
let cookie = '';
let userId: number;

const makeRequest = (method: string, body?: unknown, authed = true) =>
  new Request('http://localhost/api/projects', {
    method,
    headers: {
      ...(authed ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

beforeAll(async () => {
  testDb = await createTestDb();

  ({ loader, action } = await import('~/routes/api.projects'));

  const user = await testDb.prisma.user.create({ data: { username: 'unit-owner', password: 'hash' } });

  userId = user.id;
  cookie = (await signSession(ENV, { id: user.id, username: user.username })).split(';')[0];
}, 60_000);

afterAll(async () => {
  await testDb?.dispose();
});

describe('GET /api/projects (loader)', () => {
  it('returns 401 without a session', async () => {
    const response = await loader({ request: makeRequest('GET', undefined, false), params: {}, context } as any);

    expect(response.status).toBe(401);
  });

  it('lists own projects newest-first without message payloads', async () => {
    const first: any = await (await action({ request: makeRequest('POST', {}), params: {}, context } as any)).json();
    const second: any = await (await action({ request: makeRequest('POST', {}), params: {}, context } as any)).json();

    // Bump the first project so ordering by updatedAt is deterministic.
    await testDb!.prisma.project.update({
      where: { id: first.id },
      data: { description: 'bumped' },
    });

    const response = await loader({ request: makeRequest('GET'), params: {}, context } as any);
    const projects = (await response.json()) as any[];

    expect(response.status).toBe(200);
    expect(projects[0].id).toBe(first.id);
    expect(projects.map((p) => p.id)).toContain(second.id);
    expect(projects.every((p) => !('messages' in p))).toBe(true);
    expect(projects[0].description).toBe('bumped');
  });
});

describe('POST /api/projects (action)', () => {
  it('returns 401 without a session', async () => {
    const response = await action({ request: makeRequest('POST', {}, false), params: {}, context } as any);

    expect(response.status).toBe(401);
  });

  it('rejects non-POST methods', async () => {
    const response = await action({ request: makeRequest('DELETE'), params: {}, context } as any);

    expect(response.status).toBe(405);
  });

  it('creates a project with a random 16-hex urlId', async () => {
    const response = await action({
      request: makeRequest('POST', { description: 'Demo' }),
      params: {},
      context,
    } as any);
    const project: any = await response.json();

    expect(response.status).toBe(201);
    expect(project.urlId).toMatch(/^[0-9a-f]{16}$/);
    expect(project.description).toBe('Demo');
    expect(project.id).toBeTruthy();
  });

  it('generates unique urlIds for each project (no collision)', async () => {
    const a: any = await (await action({ request: makeRequest('POST'), params: {}, context } as any)).json();
    const b: any = await (await action({ request: makeRequest('POST'), params: {}, context } as any)).json();

    expect(a.urlId).toMatch(/^[0-9a-f]{16}$/);
    expect(b.urlId).toMatch(/^[0-9a-f]{16}$/);
    expect(a.urlId).not.toBe(b.urlId);
  });

  it('scopes the list to the owning user', async () => {
    const otherUser = await testDb!.prisma.user.create({ data: { username: 'unit-other', password: 'hash' } });
    const otherCookie = (await signSession(ENV, { id: otherUser.id, username: otherUser.username })).split(';')[0];

    const response = await loader({
      request: new Request('http://localhost/api/projects', { headers: { cookie: otherCookie } }),
      params: {},
      context,
    } as any);
    const projects = (await response.json()) as any[];

    expect(projects).toHaveLength(0);
    expect(userId).toBeGreaterThan(0);
  });
});
