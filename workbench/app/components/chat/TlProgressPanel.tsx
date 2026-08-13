/*
 * add-multi-agent-team (task 5.4, design D12 / TL-03 / TL-04): TL progress
 * panel — per-step statuses, a TL phase line in Chinese, and the user-only
 * pause actions (重试该步 / 跳过该步 / 终止编排).
 */
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
      return `TL：步骤 ${currentIndex + 1} 执行失败（${failReason || '未知原因'}），等待处理`;
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
}

export function TlProgressPanel({
  phase,
  steps,
  currentIndex,
  failReason,
  onRetryStep,
  onSkipStep,
  onTerminate,
}: TlProgressPanelProps) {
  if (phase === 'idle' || steps.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm"
      data-testid="tl-progress-panel"
    >
      <div className="text-bolt-elements-textPrimary mb-2" data-testid="tl-phase-line">
        {phaseLine(phase, currentIndex, steps.length, failReason)}
      </div>
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
      {phase === 'paused' && (
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
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-icon-error hover:bg-bolt-elements-background-depth-3"
            onClick={onTerminate}
            data-testid="tl-terminate"
          >
            终止编排
          </button>
        </div>
      )}
      {(phase === 'executing' || phase === 'settling') && (
        <div className="flex gap-2 mt-3">
          <button
            className="px-3 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-icon-error hover:bg-bolt-elements-background-depth-3"
            onClick={onTerminate}
            data-testid="tl-terminate-live"
          >
            终止编排
          </button>
        </div>
      )}
    </div>
  );
}
