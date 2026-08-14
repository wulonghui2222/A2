import { memo, useEffect, useState } from 'react';

/*
 * chat-response-stats (design D2): per-request lifecycle derived from useChat
 * signals (send / onResponse / first content delta / onFinish / onError).
 * dashscope-reasoning-stream inserts `thinking` between waiting and streaming
 * when the first reasoning annotation arrives (WB-09: waiting = 等待响应).
 *
 * add-multi-agent-team (task 3.4 / WB-17): `planning` covers the PD planning
 * round stream; `plan_proposed` is the hard gate waiting for user approval.
 */
export type RequestStatus =
  | 'idle'
  | 'submitting'
  | 'waiting'
  | 'thinking'
  | 'streaming'
  | 'planning'
  | 'plan_proposed'
  | 'finished'
  | 'error';

interface ResponseStatsProps {
  status: RequestStatus;
  startedAt?: number;

  /** Visible content characters produced so far (for the live token estimate). */
  contentLength?: number;
}

/*
 * Rough mixed-language heuristic: CJK characters ~1 token each, other
 * characters ~1 token per 4. The value is marked with 约 in the UI and is
 * replaced by the authoritative usage annotation once the stream finishes.
 */
function estimateTokens(contentLength: number) {
  return Math.max(1, Math.round(contentLength * 0.7));
}

export const ResponseStats = memo(({ status, startedAt, contentLength = 0 }: ResponseStatsProps) => {
  const [now, setNow] = useState(() => Date.now());

  const live =
    (status === 'waiting' || status === 'thinking' || status === 'streaming' || status === 'planning') &&
    startedAt !== undefined;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    if (live) {
      setNow(Date.now());

      timer = setInterval(() => {
        setNow(Date.now());
      }, 100);
    }

    return () => {
      if (timer !== undefined) {
        clearInterval(timer);
      }
    };
  }, [live, status]);

  if (!live) {
    if (status === 'plan_proposed') {
      return (
        <div className="text-sm text-bolt-elements-textSecondary" data-testid="response-stats-plan-proposed">
          计划已就绪，等待批准
        </div>
      );
    }

    return null;
  }

  const elapsedSeconds = Math.max(0, (now - (startedAt as number)) / 1000);
  const elapsedLabel = `${elapsedSeconds.toFixed(1)}s`;

  if (status === 'planning') {
    return (
      <div className="text-sm text-bolt-elements-textSecondary" data-testid="response-stats-planning">
        PD 正在规划… {elapsedLabel}
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="text-sm text-bolt-elements-textSecondary" data-testid="response-stats-waiting">
        等待响应… {elapsedLabel}
      </div>
    );
  }

  if (status === 'thinking') {
    return (
      <div className="text-sm text-bolt-elements-textSecondary" data-testid="response-stats-thinking">
        思考中… {elapsedLabel}
      </div>
    );
  }

  const estimatedTokens = estimateTokens(contentLength);
  const tokensPerSecond = elapsedSeconds > 0.5 ? Math.round(estimatedTokens / elapsedSeconds) : 0;

  return (
    <div className="text-sm text-bolt-elements-textSecondary" data-testid="response-stats-streaming">
      生成中… {elapsedLabel} · 约 {estimatedTokens} tokens{tokensPerSecond > 0 ? ` · ${tokensPerSecond} tok/s` : ''}
    </div>
  );
});
