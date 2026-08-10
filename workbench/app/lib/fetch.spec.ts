import { describe, expect, it, vi } from 'vitest';

/*
 * Under DEV mode request() delegates to node-fetch with an https agent;
 * both are stubbed so the test never touches the network.
 */
const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn<(url: string, init?: any) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
  AgentMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({ default: mocks.fetchMock }));
vi.mock('node:https', () => ({ Agent: mocks.AgentMock }));

import { request } from './fetch';

describe('request (dev mode)', () => {
  it('routes https calls through node-fetch with a relaxed-tls agent', async () => {
    await request('https://example.com/api');

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    // Asserts the existing dev-only behavior in fetch.ts (relaxed TLS for
    // local self-signed endpoints); no certificate handling happens in tests.
    expect(mocks.AgentMock).toHaveBeenCalledWith({ rejectUnauthorized: false });

    const [, init] = mocks.fetchMock.mock.calls[0];

    expect(init.agent).toBeDefined();
  });

  it('skips the agent for http URLs', async () => {
    await request('http://localhost:5173/api');

    const [, init] = mocks.fetchMock.mock.calls.at(-1)!;

    expect(init.agent).toBeUndefined();
  });

  it('forwards request options', async () => {
    await request('https://example.com/api', { method: 'POST', headers: { 'x-test': '1' } });

    const [, init] = mocks.fetchMock.mock.calls.at(-1)!;

    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-test': '1' });
  });
});
