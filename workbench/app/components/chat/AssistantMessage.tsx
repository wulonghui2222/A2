import { memo, useEffect, useRef } from 'react';
import { Markdown } from './Markdown';
import { classNames } from '~/utils/classNames';
import type { JSONValue } from 'ai';
import { A2_ENABLE_RESPONSE_STATS } from '~/a2/config';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];

  /**
   * dashscope-reasoning-stream (task 7.4): true while this message is the
   * live assistant message during thinking/streaming — the reasoning panel
   * auto-expands only then; reloaded messages stay collapsed.
   */
  isLiveMessage?: boolean;

  /**
   * Performance: true while this message is actively streaming, so
   * CodeBlock can skip expensive syntax highlighting.
   */
  isStreaming?: boolean;

  /**
   * add-multi-agent-team: which agent produced this card (PD / TL /
   * 工程师 · 步骤 N). Absent in single-agent chats.
   */
  agentLabel?: string;
}

/*
 * chat-response-stats (design D1): server-side timing attached to the usage
 * annotation; optional so messages persisted before this change keep working.
 */
interface UsageTiming {
  startedAt: number;
  firstReasoningTokenAt?: number;
  firstVisibleTokenAt?: number;
  endedAt: number;
  segmentCount: number;
}

interface ErrorStatus {
  status: 'error';
  message: string;
  at: number;
}

function formatSeconds(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

export const AssistantMessage = memo(({ content, annotations, isLiveMessage = false, isStreaming = false, agentLabel }: AssistantMessageProps) => {
  const filteredAnnotations = (annotations?.filter(
    (annotation: JSONValue) => annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
  ) || []) as { type: string; value: any }[];

  /*
   * dashscope-reasoning-stream (task 7.1): reasoning arrives as throttled
   * `8:` annotations; concatenate the deltas into the full thinking text.
   */
  const reasoningText = filteredAnnotations
    .filter((annotation) => annotation.type === 'reasoning')
    .map((annotation) => (annotation.value?.text as string | undefined) ?? '')
    .join('');

  const usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
    timing?: UsageTiming;
  } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

  /*
   * chat-response-stats (design D4): failures are recorded as a status
   * annotation by the client and stay visible after reload.
   */
  const errorStatus: ErrorStatus | undefined = filteredAnnotations.find(
    (annotation) => annotation.type === 'status',
  )?.value;

  const timing = A2_ENABLE_RESPONSE_STATS ? usage?.timing : undefined;

  /*
   * While the message is live, keep the reasoning scroll pinned to the
   * newest delta so the user reads the thinking as it flows.
   */
  const reasoningScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLiveMessage && reasoningScrollRef.current) {
      reasoningScrollRef.current.scrollTop = reasoningScrollRef.current.scrollHeight;
    }
  }, [reasoningText, isLiveMessage]);

  let timingLabel: string | undefined;

  if (timing) {
    const totalMs = timing.endedAt - timing.startedAt;
    const parts: string[] = [];

    if (timing.firstReasoningTokenAt !== undefined) {
      parts.push(`思考 ${formatSeconds(timing.firstReasoningTokenAt - timing.startedAt)}`);
    }

    if (timing.firstVisibleTokenAt !== undefined) {
      parts.push(`首字 ${formatSeconds(timing.firstVisibleTokenAt - timing.startedAt)}`);

      const generationMs = timing.endedAt - timing.firstVisibleTokenAt;

      if (generationMs > 0 && usage?.completionTokens) {
        parts.push(`${Math.round((usage.completionTokens / generationMs) * 1000)} tok/s`);
      }
    }

    parts.push(`共 ${formatSeconds(totalMs)}`);

    if (timing.segmentCount > 1) {
      parts.push(`${timing.segmentCount} 段`);
    }

    timingLabel = parts.join(' · ');
  }

  return (
    <div className="overflow-hidden w-full">
      {agentLabel && (
        <div className="mb-2">
          <span
            data-testid="agent-label"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-[11px] text-bolt-elements-textSecondary"
          >
            <span
              className={classNames(
                agentLabel === 'TL' ? 'i-ph:crown' : agentLabel === 'PD' ? 'i-ph:clipboard-text' : 'i-ph:wrench',
              )}
            />
            {agentLabel}
          </span>
        </div>
      )}
      {errorStatus?.status === 'error' && (
        <div className="text-sm text-bolt-elements-icon-error mb-2" data-testid="response-stats-error">
          请求失败：{errorStatus.message}
        </div>
      )}
      {/*
       * dashscope-reasoning-stream (tasks 7.2/7.3): collapsible thinking
       * panel. `open` is only controlled while the message is live, so
       * historical/reloaded panels stay collapsed by default.
       */}
      {reasoningText.length > 0 && (
        <details
          open={isLiveMessage || undefined}
          className="mb-3 rounded-lg bg-bolt-elements-background-depth-2 px-3 py-2"
          data-testid="reasoning-panel"
        >
          <summary className="cursor-pointer text-xs text-bolt-elements-textSecondary select-none">思考过程</summary>
          <div
            className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-bolt-elements-textTertiary"
            data-testid="reasoning-content"
            ref={reasoningScrollRef}
          >
            {reasoningText}
          </div>
        </details>
      )}
      <Markdown html isStreaming={isStreaming}>{content}</Markdown>
      {/*
       * chat-response-stats: the stats line sits below the response body so
       * it never pushes the content down while streaming.
       */}
      {usage && (
        <div className="text-xs text-bolt-elements-textSecondary mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
          Tokens: {usage.totalTokens} (prompt: {usage.promptTokens}, completion: {usage.completionTokens})
          {timingLabel ? ` · ${timingLabel}` : ''}
        </div>
      )}
    </div>
  );
});
