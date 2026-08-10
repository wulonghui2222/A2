import { memo } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import { A2_ENABLE_RESPONSE_STATS } from '~/a2/config';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
}

/*
 * chat-response-stats (design D1): server-side timing attached to the usage
 * annotation; optional so messages persisted before this change keep working.
 */
interface UsageTiming {
  startedAt: number;
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

export const AssistantMessage = memo(({ content, annotations }: AssistantMessageProps) => {
  const filteredAnnotations = (annotations?.filter(
    (annotation: JSONValue) => annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
  ) || []) as { type: string; value: any }[];

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

  let timingLabel: string | undefined;

  if (timing) {
    const totalMs = timing.endedAt - timing.startedAt;
    const parts: string[] = [];

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
      {errorStatus?.status === 'error' && (
        <div className="text-sm text-bolt-elements-icon-error mb-2" data-testid="response-stats-error">
          请求失败：{errorStatus.message}
        </div>
      )}
      <Markdown html>{content}</Markdown>
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
