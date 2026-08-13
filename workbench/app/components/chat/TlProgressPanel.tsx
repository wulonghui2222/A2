/*
 * add-multi-agent-team (task 5.4, design D12 / TL-03 / TL-04): TL progress
 * panel — per-step statuses, a TL phase line in Chinese, and the user-only
 * pause actions (重试该步 / 跳过该步 / 终止).
 */
import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import type { TlPhase, TlStepState } from '~/a2/multi-agent/useTlOrchestrator';

const STATUS_MARK: Record<TlStepState['status'], string> = {
  pending: '○',
  running: '▶',
  done: '✓',
  skipped: '⊘',
  failed: '✗',
};

function phaseLine(phase: TlPhase, currentIndex: number, total: number, failReason?: string): string {
  switch (phase) {
    case 'planning':
      return 'TL：等待 PD 规划…';
    case 'gate':
      return 'TL：计划待批准';
    case 'executing':
      return `TL：正在推进步骤 ${currentIndex + 1}/${total}…`;
    case 'settling':
      return `TL：正在确认步骤 ${currentIndex + 1} 的执行结果…`;
    case 'paused':
      return failReason
        ? `TL：步骤 ${currentIndex + 1} 执行失败（${failReason}），等待处理`
        : 'TL：推进已暂停，点击「继续」恢复';
    case 'completed':
      return 'TL：全部步骤已完成';
    case 'terminated':
      return 'TL：编排已终止';
    default:
      return '';
  }
}

interface TlProgressPanelProps {
  phase: TlPhase;
  steps: TlStepState[];
  currentIndex: number;
  failReason?: string;
  onRetryStep: () => void;
  onSkipStep: () => void;
  onTerminate: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function TlProgressPanel({
  phase,
  steps,
  currentIndex,
  failReason,
  onRetryStep,
  onSkipStep,
  onTerminate,
  onPause,
  onResume,
}: TlProgressPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (phase === 'idle' || steps.length === 0) {
    return null;
  }

  const finishedCount = steps.filter((step) => step.status === 'done' || step.status === 'skipped').length;

  return (
    <div
      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm"
      data-testid="tl-progress-panel"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="text-bolt-elements-textPrimary" data-testid="tl-phase-line">
          {phaseLine(phase, currentIndex, steps.length, failReason)}
        </div>
        {collapsed && (
          <span className="text-xs text-bolt-elements-textTertiary">
            {finishedCount}/{steps.length}
          </span>
        )}
        <button
          type="button"
          data-testid="tl-collapse"
          aria-label={collapsed ? '展开步骤' : '折叠步骤'}
          className="ml-auto p-1 rounded-md text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className={classNames('inline-block', collapsed ? 'i-ph:caret-down' : 'i-ph:caret-up')} />
        </button>
      </div>
      {!collapsed && (
      <ul className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <li
            key={index}
            className={classNames('flex gap-2', {
              'text-bolt-elements-textPrimary': step.status === 'running' || step.status === 'done',
              'text-bolt-elements-textSecondary': step.status === 'pending' || step.status === 'skipped',
              'text-bolt-elements-icon-error': step.status === 'failed',
            })}
            data-testid={`tl-step-${index + 1}`}
            data-status={step.status}
          >
            <span className="shrink-0">{STATUS_MARK[step.status]}</span>
            <span>{step.text}</span>
          </li>
        ))}
      </ul>
      )}
      {phase === 'paused' && failReason && (
        <div className="flex gap-2 mt-3">
          <button
            className="px-3 py-1 rounded bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
            onClick={onRetryStep}
            data-testid="tl-retry-step"
          >
            重试该步
          </button>
          <button
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            onClick={onSkipStep}
            data-testid="tl-skip-step"
          >
            跳过该步
          </button>
          <button
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            onClick={onTerminate}
            data-testid="tl-terminate"
          >
            终止
          </button>
        </div>
      )}
      {phase === 'paused' && !failReason && (
        <div className="flex gap-2 mt-3">
          <button
            className="px-3 py-1 rounded bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
            onClick={onResume}
            data-testid="tl-resume"
          >
            继续
          </button>
          <button
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            onClick={onTerminate}
            data-testid="tl-terminate"
          >
            终止
          </button>
        </div>
      )}
      {(phase === 'executing' || phase === 'settling') && (
        <div className="flex gap-2 mt-3">
          <button
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            onClick={onPause}
            data-testid="tl-pause"
          >
            暂停
          </button>
          <button
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            onClick={onTerminate}
            data-testid="tl-terminate-live"
          >
            终止
          </button>
        </div>
      )}
    </div>
  );
}
