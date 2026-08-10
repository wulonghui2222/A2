import { beforeEach, describe, expect, it, vi } from 'vitest';

// selectStarterTemplate posts to /api/llmcall; stub the network layer.
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

import { selectStarterTemplate } from './selectStarterTemplate';

const provider = { name: 'OpenAILike' } as any;

const respondWith = (text: string) =>
  fetchMock.mockResolvedValueOnce({ json: async () => ({ text }) } as unknown as Response);

describe('selectStarterTemplate', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('parses the LLM selection and title', async () => {
    respondWith('<selection><templateName>bolt-vite-react</templateName><title>Todo App</title></selection>');

    const result = await selectStarterTemplate({ message: 'build a todo app', model: 'm', provider });

    expect(result).toEqual({ template: 'bolt-vite-react', title: 'Todo App' });
  });

  it('defaults the title when the LLM omits it', async () => {
    respondWith('<selection><templateName>bolt-vue</templateName></selection>');

    const result = await selectStarterTemplate({ message: 'x', model: 'm', provider });

    expect(result).toEqual({ template: 'bolt-vue', title: 'Untitled Project' });
  });

  it('falls back to the blank template when the response has no selection', async () => {
    respondWith('sorry, I cannot help with that');

    const result = await selectStarterTemplate({ message: 'x', model: 'm', provider });

    expect(result).toEqual({ template: 'blank', title: '' });
  });

  it('sends the message, model, provider and system prompt to /api/llmcall', async () => {
    respondWith('<selection><templateName>blank</templateName><title>t</title></selection>');

    await selectStarterTemplate({ message: 'hello', model: 'model-x', provider });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/llmcall');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);

    expect(body.message).toBe('hello');
    expect(body.model).toBe('model-x');
    expect(body.system).toContain('Available templates');
    // shadcn templates are excluded from the selection prompt.
    expect(body.system).not.toContain('bolt-nextjs-shadcn');
  });
});
