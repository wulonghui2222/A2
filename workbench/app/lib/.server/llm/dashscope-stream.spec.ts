import { parseDataStreamPart } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashScopeStreamText, formatDataStreamLine } from './dashscope-stream';

/*
 * dashscope-reasoning-stream (task 3.2): wire format verification. A mock SSE
 * response flows through dashScopeStreamText; the emitted bytes must be valid
 * AI SDK data-stream parts (8: reasoning, 0: text, trailing e: finish_step),
 * parseable by the same parser useChat uses on the client.
 */

function sseLine(chunk: Record<string, unknown>): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function mockSseFetch(body: string) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    expect(url).toContain('/api/llm/chat/completions');

    return new Response(new TextEncoder().encode(body), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
}

async function collectLines(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    text += decoder.decode(value, { stream: true });
  }

  return text.split('\n').filter((line) => line !== '');
}

const ENV = { A2_SELF_BASE_URL: 'http://localhost:5173', A2_INTERNAL_TOKEN: 'test-token' } as unknown as Env;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatDataStreamLine', () => {
  it('produces <code>:<JSON>\\n like formatDataStreamPart', () => {
    expect(formatDataStreamLine('0', 'hello')).toBe('0:"hello"\n');
    expect(formatDataStreamLine('8', [{ type: 'reasoning', value: { text: 'x' } }])).toBe(
      '8:[{"type":"reasoning","value":{"text":"x"}}]\n',
    );
  });
});

describe('dashScopeStreamText wire format', () => {
  it('emits reasoning annotations, text deltas, and a trailing e: part in order', async () => {
    const body =
      sseLine({ choices: [{ delta: { reasoning_content: 'thinking part 1' }, finish_reason: null }] }) +
      sseLine({ choices: [{ delta: { reasoning_content: ' and 2' }, finish_reason: null }] }) +
      sseLine({ choices: [{ delta: { content: 'answer A' }, finish_reason: null }] }) +
      sseLine({ choices: [{ delta: { content: ' B' }, finish_reason: null }] }) +
      sseLine({ choices: [{ delta: {}, finish_reason: 'stop' }] }) +
      sseLine({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 } }) +
      'data: [DONE]\n\n';

    vi.stubGlobal('fetch', mockSseFetch(body));

    const onFinish = vi.fn();
    const onFirstTextDelta = vi.fn();
    const onFirstReasoningToken = vi.fn();

    const result = dashScopeStreamText({
      model: 'glm-5.2',
      system: 'sys',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: ENV,
      options: { onFinish },
      onFirstTextDelta,
      onFirstReasoningToken,
    });

    const lines = await collectLines(result.toDataStream());
    const parts = lines.map((line) => parseDataStreamPart(line));

    // every line must parse as a known data-stream part (no d: emitted, D8)
    const types = parts.map((part) => part.type);
    expect(types).not.toContain('finish_message');
    expect(types[types.length - 1]).toBe('finish_step');

    // reasoning arrives before any visible text. An empty `0:""` seed part
    // precedes the first reasoning annotation (forces client message
    // creation, ui-utils@1.0.5 drops annotations without a message).
    const firstReasoning = parts.findIndex((part) => part.type === 'message_annotations');
    expect(parts[0]).toEqual({ type: 'text', value: '' });
    expect(firstReasoning).toBe(1);

    const firstVisibleText = parts.findIndex((part) => part.type === 'text' && (part.value as string).length > 0);
    expect(firstVisibleText).toBeGreaterThan(firstReasoning);

    // annotations carry the exact writeMessageAnnotation shape
    const reasoningText = parts
      .filter((part) => part.type === 'message_annotations')
      .flatMap((part) => part.value as Array<{ type: string; value: { text: string } }>)
      .filter((annotation) => annotation.type === 'reasoning')
      .map((annotation) => annotation.value.text)
      .join('');
    expect(reasoningText).toBe('thinking part 1 and 2');

    // text deltas concatenate to the full answer
    const text = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.value as string)
      .join('');
    expect(text).toBe('answer A B');

    // trailing finish_step preserves per-segment message splitting (D8)
    const finishStep = parts[parts.length - 1].value as { finishReason: string; isContinued: boolean };
    expect(finishStep).toEqual({ finishReason: 'stop', isContinued: false });

    // callbacks
    expect(onFirstReasoningToken).toHaveBeenCalledTimes(1);
    expect(onFirstTextDelta).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({
      text: 'answer A B',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 7, totalTokens: 17 },
    });
  });

  it('emits no reasoning parts when the model only produces content', async () => {
    const body =
      sseLine({ choices: [{ delta: { content: 'plain' }, finish_reason: null }] }) +
      sseLine({ choices: [{ delta: {}, finish_reason: 'length' }] }) +
      'data: [DONE]\n\n';

    vi.stubGlobal('fetch', mockSseFetch(body));

    const onFinish = vi.fn();
    const onFirstReasoningToken = vi.fn();

    const result = dashScopeStreamText({
      model: 'glm-5.2',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: ENV,
      options: { onFinish },
      onFirstReasoningToken,
    });

    const parts = (await collectLines(result.toDataStream())).map((line) => parseDataStreamPart(line));

    // no reasoning -> no seed part either
    expect(parts.some((part) => part.type === 'message_annotations')).toBe(false);
    expect(parts.some((part) => part.type === 'text' && (part.value as string) === '')).toBe(false);
    expect(onFirstReasoningToken).not.toHaveBeenCalled();

    // length finish reason flows through for continuation segments
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ finishReason: 'length' }));
    expect(parts[parts.length - 1].value).toEqual({ finishReason: 'length', isContinued: false });
  });

  it('sends the internal token header and include_usage stream option', async () => {
    const body = sseLine({ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
    const fetchMock = mockSseFetch(body);
    vi.stubGlobal('fetch', fetchMock);

    const result = dashScopeStreamText({
      model: 'glm-5.2',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: ENV,
    });

    await collectLines(result.toDataStream());

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0];
    const requestInit = init as unknown as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(headers['x-a2-internal']).toBe('test-token');

    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.stream).toBe(true);
    expect(sentBody.stream_options).toEqual({ include_usage: true });
    expect(sentBody.model).toBe('glm-5.2');
  });

  it('emits an error part when the gateway responds with an error', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'model not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = dashScopeStreamText({
      model: 'nope',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: ENV,
    });

    const parts = (await collectLines(result.toDataStream())).map((line) => parseDataStreamPart(line));

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('error');
    expect(parts[0].value).toBe('model not found');

    // 4xx is deterministic — never retried
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('dashScopeStreamText resilience', () => {
  const FAST_TIMEOUT_ENV = {
    A2_SELF_BASE_URL: 'http://localhost:5173',
    A2_INTERNAL_TOKEN: 'test-token',
    A2_LLM_TTFB_TIMEOUT_MS: '50',
  } as unknown as Env;

  const successBody =
    sseLine({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';

  function successResponse() {
    return new Response(new TextEncoder().encode(successBody), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  it('retries once after a TTFB timeout and completes on the second attempt', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(async () => successResponse());
    vi.stubGlobal('fetch', fetchMock);

    const onFinish = vi.fn();
    const result = dashScopeStreamText({
      model: 'glm-5.2',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: FAST_TIMEOUT_ENV,
      options: { onFinish },
    });

    const parts = (await collectLines(result.toDataStream())).map((line) => parseDataStreamPart(line));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parts.some((part) => part.type === 'error')).toBe(false);
    expect(parts.filter((part) => part.type === 'text').map((part) => part.value).join('')).toBe('ok');
    expect(parts[parts.length - 1].type).toBe('finish_step');
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ text: 'ok', finishReason: 'stop' }));
  });

  it('retries a 5xx gateway response', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(async () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }))
      .mockImplementationOnce(async () => successResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = dashScopeStreamText({
      model: 'glm-5.2',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: FAST_TIMEOUT_ENV,
    });

    const parts = (await collectLines(result.toDataStream())).map((line) => parseDataStreamPart(line));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parts.filter((part) => part.type === 'text').map((part) => part.value).join('')).toBe('ok');
  });

  it('reports the failure with the attempt count after exhausting retries', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"message":"overloaded"}}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = dashScopeStreamText({
      model: 'glm-5.2',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: FAST_TIMEOUT_ENV,
    });

    const parts = (await collectLines(result.toDataStream())).map((line) => parseDataStreamPart(line));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('error');
    expect(parts[0].value).toBe('overloaded (after 2 attempts)');
  });

  it('does not retry a mid-stream stall once content has been emitted', async () => {
    const encoder = new TextEncoder();
    const stallingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseLine({ choices: [{ delta: { content: 'partial' }, finish_reason: null }] })));
        // never closes: upstream went silent mid-stream
      },
    });

    const fetchMock = vi.fn(
      async () =>
        new Response(stallingBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = dashScopeStreamText({
      model: 'glm-5.2',
      maxTokens: 4096,
      messages: [{ role: 'user', content: 'hi' }],
      env: FAST_TIMEOUT_ENV,
    });

    const parts = (await collectLines(result.toDataStream())).map((line) => parseDataStreamPart(line));

    // replaying would duplicate the visible 'partial' text, so no retry
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const text = parts.filter((part) => part.type === 'text').map((part) => part.value).join('');
    expect(text).toBe('partial');

    const errorPart = parts.find((part) => part.type === 'error');
    expect(errorPart?.value).toContain('no data from the LLM upstream within');
  });
});
