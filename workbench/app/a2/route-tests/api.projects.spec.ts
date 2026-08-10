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
    await action({ request: makeRequest('POST', { urlId: 'list-a' }), params: {}, context } as any);
    await action({ request: makeRequest('POST', { urlId: 'list-b' }), params: {}, context } as any);

    // Bump list-a so ordering by updatedAt is deterministic.
    const bumped = await testDb!.prisma.project.update({
      where: { urlId: 'list-a' },
      data: { description: 'bumped' },
    });

    const response = await loader({ request: makeRequest('GET'), params: {}, context } as any);
    const projects = (await response.json()) as any[];

    expect(response.status).toBe(200);
    expect(projects[0].urlId).toBe('list-a');
    expect(projects.map((p) => p.urlId)).toContain('list-b');
    expect(projects.every((p) => !('messages' in p))).toBe(true);
    expect(bumped.description).toBe('bumped');
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

  it('creates a project with the requested slug', async () => {
    const response = await action({
      request: makeRequest('POST', { urlId: 'demo', description: 'Demo ' }),
      params: {},
      context,
    } as any);
    const project: any = await response.json();

    expect(response.status).toBe(201);
    expect(project.urlId).toBe('demo');
    expect(project.description).toBe('Demo');
    expect(project.id).toBeTruthy();
  });

  it('appends bolt-style suffixes on slug collisions', async () => {
    const second: any = await (await action({ request: makeRequest('POST', { urlId: 'demo' }), params: {}, context } as any)).json();
    const third: any = await (await action({ request: makeRequest('POST', { urlId: 'demo' }), params: {}, context } as any)).json();

    expect(second.urlId).toBe('demo-2');
    expect(third.urlId).toBe('demo-3');
  });

  it('generates a slug when none is provided', async () => {
    const response = await action({ request: makeRequest('POST'), params: {}, context } as any);
    const project: any = await response.json();

    expect(response.status).toBe(201);
    expect(project.urlId).toMatch(/^chat-/);
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
