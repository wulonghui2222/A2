import { describe, expect, it } from 'vitest';
import { parseSseStream, type SseChunk } from './sse-parser';

/*
 * dashscope-reasoning-stream (task 1.2): parser coverage — text/reasoning
 * deltas, mixed streams, [DONE], usage-only final chunk, partial line
 * reassembly across network chunks, and empty choices arrays.
 */

function sseResponse(text: string): Response {
  return new Response(new TextEncoder().encode(text), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Build a Response whose body delivers the given byte slices as separate network chunks. */
function chunkedResponse(slices: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const slice of slices) {
        controller.enqueue(slice);
      }

      controller.close();
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

function dataLine(chunk: Record<string, unknown>): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

async function collect(response: Response): Promise<SseChunk[]> {
  const chunks: SseChunk[] = [];

  for await (const chunk of parseSseStream(response)) {
    chunks.push(chunk);
  }

  return chunks;
}

describe('parseSseStream', () => {
  it('parses a normal content text delta', async () => {
    const body = dataLine({ choices: [{ delta: { content: 'hello' }, finish_reason: null }] });
    const chunks = await collect(sseResponse(body));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta?.content).toBe('hello');
  });

  it('parses a reasoning_content delta', async () => {
    const body = dataLine({ choices: [{ delta: { reasoning_content: 'let me think' }, finish_reason: null }] });
    const chunks = await collect(sseResponse(body));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta?.reasoning_content).toBe('let me think');
  });

  it('keeps reasoning and content deltas in arrival order', async () => {
    const body =
      dataLine({ choices: [{ delta: { reasoning_content: 'step 1' }, finish_reason: null }] }) +
      dataLine({ choices: [{ delta: { reasoning_content: ' then 2' }, finish_reason: null }] }) +
      dataLine({ choices: [{ delta: { content: 'answer' }, finish_reason: null }] }) +
      dataLine({ choices: [{ delta: {}, finish_reason: 'stop' }] }) +
      'data: [DONE]\n\n';
    const chunks = await collect(sseResponse(body));

    expect(chunks.map((c) => c.delta?.reasoning_content).filter(Boolean)).toEqual(['step 1', ' then 2']);
    expect(chunks.map((c) => c.delta?.content).filter(Boolean)).toEqual(['answer']);
    expect(chunks[chunks.length - 1].finish_reason).toBe('stop');
  });

  it('ignores the [DONE] sentinel', async () => {
    const chunks = await collect(sseResponse('data: [DONE]\n\n'));

    expect(chunks).toHaveLength(0);
  });

  it('surfaces the usage-only final chunk with an empty choices array', async () => {
    const body =
      dataLine({ choices: [], usage: { prompt_tokens: 13, completion_tokens: 6, total_tokens: 19 } }) +
      'data: [DONE]\n\n';
    const chunks = await collect(sseResponse(body));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].usage).toEqual({ prompt_tokens: 13, completion_tokens: 6, total_tokens: 19 });
  });

  it('reassembles a data: line split across network chunks without losing text', async () => {
    const full = dataLine({ choices: [{ delta: { reasoning_content: 'split-me' }, finish_reason: null }] });
    const bytes = new TextEncoder().encode(full);
    const cut = Math.floor(bytes.length / 2);
    const chunks = await collect(chunkedResponse([bytes.slice(0, cut), bytes.slice(cut)]));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta?.reasoning_content).toBe('split-me');
  });

  it('handles multi-byte characters split at a UTF-8 byte boundary', async () => {
    const full = dataLine({ choices: [{ delta: { content: '中文内容' }, finish_reason: null }] });
    const bytes = new TextEncoder().encode(full);

    // cut one byte inside the first CJK character ('中' encodes as E4 B8 AD)
    const cut = Array.from(bytes).findIndex((byte) => byte === 0xe4) + 1;
    const chunks = await collect(chunkedResponse([bytes.slice(0, cut), bytes.slice(cut)]));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta?.content).toBe('中文内容');
  });

  it('skips empty choices arrays without usage and malformed lines', async () => {
    const body =
      dataLine({ choices: [] }) +
      'data: {not-json\n\n' +
      dataLine({ choices: [{ delta: { content: 'ok' }, finish_reason: null }] });
    const chunks = await collect(sseResponse(body));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta?.content).toBe('ok');
  });
});
