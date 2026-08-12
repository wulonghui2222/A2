import { A2_DEFAULT_MODEL } from '~/a2/config';
import { parseSseStream } from './sse-parser';

/*
 * dashscope-reasoning-stream (design D1-D3, D8): direct gateway streaming for
 * the platform default model. Bypasses the `ai` package's streamText +
 * @ai-sdk/openai adapter (which discards reasoning_content) and produces the
 * AI SDK data-stream wire format by hand so `useChat` works unchanged.
 *
 * Wire parts emitted (verified against @ai-sdk/ui-utils@1.0.5):
 *   8:[{"type":"reasoning","value":{"text":...}}]\n  — throttled ~200ms
 *   0:"<content delta>"\n                            — one line per SSE delta
 *   e:{"finishReason":...,"isContinued":false}\n     — end of segment (D8)
 */

const REASONING_THROTTLE_MS = 200;

export interface DashScopeUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface DashScopeFinishEvent {
  text: string;
  finishReason: string;
  usage?: DashScopeUsage;
}

export interface DashScopeStreamOptions {
  /** Same contract as the `ai` streamText onFinish used by api.chat.ts. */
  onFinish?: (event: DashScopeFinishEvent) => void | Promise<void>;
}

export interface DashScopeStreamTextProps {
  model: string;
  system?: string;
  maxTokens: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  env: Env;
  options?: DashScopeStreamOptions;

  /** First visible content delta (TTFT tap, chat-response-stats). */
  onFirstTextDelta?: () => void;

  /** First reasoning_content delta (TTRT tap, task 2.3). */
  onFirstReasoningToken?: () => void;
}

/** Mirrors formatDataStreamPart in @ai-sdk/ui-utils: `<code>:<JSON>\n`. */
export function formatDataStreamLine(code: string, value: unknown): string {
  return `${code}:${JSON.stringify(value)}\n`;
}

/** Map an OpenAI-compatible finish_reason onto the AI SDK finishReason set. */
function mapFinishReason(reason?: string | null): string {
  switch (reason) {
    case 'length': {
      return 'length';
    }
    case 'content_filter': {
      return 'content-filter';
    }
    case 'tool_calls': {
      return 'tool-calls';
    }
    default: {
      return 'stop';
    }
  }
}

export interface DashScopeStreamResult {
  /** Drop-in for `result.toDataStream()` in api.chat.ts / stream-text.ts. */
  toDataStream: () => ReadableStream<Uint8Array>;

  /** Plain answer text (api.enhancer / api.llmcall); consumes the stream. */
  textStream: ReadableStream<string>;
}

export function dashScopeStreamText(props: DashScopeStreamTextProps): DashScopeStreamResult {
  const encoder = new TextEncoder();

  let accumulatedText = '';
  let finishReason = 'stop';
  let usage: DashScopeUsage | undefined;
  let firstTextDeltaReported = false;
  let firstReasoningTokenReported = false;

  /*
   * @ai-sdk/ui-utils@1.0.5 drops annotation parts received before the
   * assistant message exists: onMessageAnnotationsPart never calls
   * getMessage(), and execUpdate() bails out while currentMessage == null.
   * Reasoning always precedes content for a thinking model, so the first `8:`
   * flush is preceded by an empty `0:""` part that forces message creation
   * (content + '' is a no-op). Until then, reasoning stays in the buffer.
   */
  let assistantMessageSeeded = false;
  let reasoningBuffer = '';
  let lastReasoningFlushAt = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function safeEnqueue(controller: ReadableStreamDefaultController<Uint8Array>, line: string) {
    if (closed) {
      return;
    }

    try {
      controller.enqueue(encoder.encode(line));
    } catch {
      closed = true;
    }
  }

  function flushReasoning(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (reasoningBuffer.length === 0) {
      return;
    }

    if (!assistantMessageSeeded) {
      assistantMessageSeeded = true;
      safeEnqueue(controller, formatDataStreamLine('0', ''));
    }

    const text = reasoningBuffer;
    reasoningBuffer = '';
    lastReasoningFlushAt = Date.now();

    // RS-02: single-element array — the exact shape writeMessageAnnotation emits
    safeEnqueue(controller, formatDataStreamLine('8', [{ type: 'reasoning', value: { text } }]));
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        /*
         * Same gateway resolution as openai-like.ts: Node fetch needs an
         * absolute URL; the internal token replaces the missing session cookie
         * on server-side self-calls (LG-03 exception).
         */
        const envVars = props.env as unknown as Record<string, string | undefined>;
        const selfBase = envVars?.A2_SELF_BASE_URL || 'http://localhost:5173';
        const internalToken = envVars?.A2_INTERNAL_TOKEN;

        const requestMessages: Array<{ role: string; content: string }> = [];

        if (props.system) {
          requestMessages.push({ role: 'system', content: props.system });
        }

        requestMessages.push(...props.messages);

        const response = await fetch(`${selfBase}/api/llm/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(internalToken ? { 'x-a2-internal': internalToken } : {}),
          },
          body: JSON.stringify({
            model: props.model,
            messages: requestMessages,
            max_tokens: props.maxTokens,
            stream: true,

            // usage-only final chunk (RS-04 usage accumulation in api.chat)
            stream_options: { include_usage: true },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          let message = `LLM request failed with status ${response.status}`;

          try {
            const parsed = JSON.parse(errorText) as { error?: { message?: string } };

            if (parsed?.error?.message) {
              message = parsed.error.message;
            }
          } catch {
            // keep the generic message
          }

          safeEnqueue(controller, formatDataStreamLine('3', message));
          closed = true;
          controller.close();

          return;
        }

        for await (const chunk of parseSseStream(response)) {
          const reasoningDelta = chunk.delta?.reasoning_content;
          const contentDelta = chunk.delta?.content;

          if (reasoningDelta) {
            if (!firstReasoningTokenReported) {
              firstReasoningTokenReported = true;
              props.onFirstReasoningToken?.();
            }

            reasoningBuffer += reasoningDelta;

            /*
             * D3 trade-off: every `8:` part triggers a full client re-render
             * with a deep message copy, so buffer deltas and flush at most
             * once per REASONING_THROTTLE_MS.
             */
            const elapsed = Date.now() - lastReasoningFlushAt;

            if (elapsed >= REASONING_THROTTLE_MS) {
              flushReasoning(controller);
            } else if (flushTimer === undefined) {
              flushTimer = setTimeout(() => {
                flushTimer = undefined;
                flushReasoning(controller);
              }, REASONING_THROTTLE_MS - elapsed);
            }
          }

          if (contentDelta) {
            assistantMessageSeeded = true;

            if (!firstTextDeltaReported) {
              firstTextDeltaReported = true;
              props.onFirstTextDelta?.();
            }

            accumulatedText += contentDelta;
            safeEnqueue(controller, formatDataStreamLine('0', contentDelta));
          }

          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
          }

          if (chunk.finish_reason) {
            finishReason = mapFinishReason(chunk.finish_reason);
          }
        }

        if (flushTimer !== undefined) {
          clearTimeout(flushTimer);
          flushTimer = undefined;
        }

        // any buffered reasoning must land before the segment ends
        flushReasoning(controller);

        // D8: e: with isContinued:false preserves today's per-segment message split
        safeEnqueue(controller, formatDataStreamLine('e', { finishReason, isContinued: false }));

        closed = true;
        controller.close();

        await props.options?.onFinish?.({ text: accumulatedText, finishReason, usage });
      } catch (error) {
        if (flushTimer !== undefined) {
          clearTimeout(flushTimer);
          flushTimer = undefined;
        }

        safeEnqueue(controller, formatDataStreamLine('3', error instanceof Error ? error.message : String(error)));

        try {
          closed = true;
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return {
    toDataStream: () => stream,

    /*
     * Text-only view for the non-chat routes: tee the wire stream and decode
     * the `0:` parts back into plain deltas (mirrors the ai package's
     * textStream, which filters text-delta chunks).
     */
    get textStream(): ReadableStream<string> {
      const [wireBranch] = stream.tee();
      const decoder = new TextDecoder();
      let buffer = '';

      return wireBranch.pipeThrough(
        new TransformStream<Uint8Array, string>({
          transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });

            let newlineIndex = buffer.indexOf('\n');

            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              if (line.startsWith('0:')) {
                try {
                  controller.enqueue(JSON.parse(line.slice(2)) as string);
                } catch {
                  // skip malformed text lines
                }
              }

              newlineIndex = buffer.indexOf('\n');
            }
          },
        }),
      );
    },
  };
}

/** Platform-default check used by stream-text.ts to pick the direct path (task 4.1). */
export function isDashScopeDefault(providerName: string, modelName: string): boolean {
  return providerName === 'OpenAILike' && modelName === A2_DEFAULT_MODEL;
}
