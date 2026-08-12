/*
 * dashscope-reasoning-stream (tasks 1.1/1.2): SSE parser for the Bailian
 * OpenAI-compatible chat completions stream. The gateway passes the upstream
 * SSE through unchanged (LG-01), so both `reasoning_content` and `content`
 * deltas are present in the body; this parser surfaces them.
 */

export interface SseChunkDelta {
  content?: string;
  reasoning_content?: string;
}

export interface SseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface SseChunk {
  delta?: SseChunkDelta;
  finish_reason?: string | null;
  usage?: SseUsage;
}

/**
 * Parse an SSE chat-completions response body into an async iterable of
 * chunks. Incomplete `data:` lines split across network chunks are buffered
 * until a full line arrives (RS-01 scenario: partial SSE chunk boundaries).
 * Malformed JSON lines are skipped defensively — a single bad line must not
 * abort the whole stream.
 */
export async function* parseSseStream(response: Response): AsyncGenerator<SseChunk> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        const chunk = parseSseLine(line);

        if (chunk) {
          yield chunk;
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }

    // flush any trailing line that arrived without a final newline
    const chunk = parseSseLine(buffer.trim());

    if (chunk) {
      yield chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseLine(line: string): SseChunk | undefined {
  if (!line.startsWith('data:')) {
    // SSE comments (:keep-alive), event/id fields, and empty lines
    return undefined;
  }

  const payload = line.slice(5).trim();

  if (payload === '[DONE]') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(payload) as { choices?: Array<SseChunk> };

    // keep-alive chunks and some error shapes carry no choices
    const first = parsed.choices?.[0];

    if (first) {
      return first;
    }

    // usage-only final chunk (stream_options.include_usage): Bailian emits it
    // with an empty choices array; surface it when usage is present.
    if ((parsed as SseChunk).usage) {
      return { usage: (parsed as SseChunk).usage };
    }

    return undefined;
  } catch {
    return undefined;
  }
}
