import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '~/a2/db.fixture';
import { signSession } from '~/a2/session.server';

/*
 * A2 test-suite (TS-01): plaza listing only exposes public projects
 * (PL-01), ordered by popularity. The Header component is stubbed so the
 * route module loads without the workbench store graph.
 */

let testDb: TestDb | undefined;

vi.mock('~/a2/db.server', () => ({
  get prisma() {
    return testDb!.prisma;
  },
}));

vi.mock('~/components/header/Header', () => ({
  Header: () => null,
}));

const ENV = { SESSION_SECRET: 'test-secret' };
const context = { cloudflare: { env: ENV } } as any;

let loader: typeof import('~/routes/plaza._index').loader;

const request = (cookie?: string) =>
  new Request('http://localhost/plaza', { headers: cookie ? { cookie } : {} });

beforeAll(async () => {
  testDb = await createTestDb();

  ({ loader } = await import('~/routes/plaza._index'));

  const owner = await testDb.prisma.user.create({ data: { username: 'plaza-owner', password: 'hash' } });

  await testDb.prisma.project.createMany({
    data: [
      { urlId: 'plaza-hot', description: '热门项目', userId: owner.id, isPublic: true, viewCount: 9 },
      { urlId: 'plaza-cool', description: '普通项目', userId: owner.id, isPublic: true, viewCount: 3 },
      { urlId: 'plaza-secret', description: '私有项目', userId: owner.id, isPublic: false },
    ],
  });
}, 60_000);

afterAll(async () => {
  await testDb?.dispose();
});

describe('plaza listing (PL-01)', () => {
  it('lists only public projects, most viewed first', async () => {
    const response = await loader({ request: request(), params: {}, context } as any);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.projects.map((p: any) => p.urlId)).toEqual(['plaza-hot', 'plaza-cool']);
    expect(data.projects[0].viewCount).toBe(9);
  });

  it('never leaks private projects to anonymous visitors', async () => {
    const data = (await (await loader({ request: request(), params: {}, context } as any)).json()) as any;

    expect(data.projects.some((p: any) => p.urlId === 'plaza-secret')).toBe(false);
    expect(data.username).toBeUndefined();
  });

  it('includes the session username for logged-in visitors', async () => {
    const user = await testDb!.prisma.user.findUnique({ where: { username: 'plaza-owner' } });
    const cookie = (await signSession(ENV, { id: user!.id, username: user!.username })).split(';')[0];

    const data = (await (await loader({ request: request(cookie), params: {}, context } as any)).json()) as any;

    expect(data.username).toBe('plaza-owner');
  });
});
