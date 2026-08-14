/*
 * add-multi-agent-team (task 3.3, design D5 / MA-03 / MA-04): mandatory
 * review gate card. No auto-continue, no timeout — the only exits are the
 * user's explicit approve / replan / skip. Editing stays local (no model
 * call); replan carries the user's feedback back to /api/plan.
 */
import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';
import type { PdPlanSelection } from '~/a2/multi-agent/pd-plan-parser';

interface AgentPlanPanelProps {
  steps: string[];
  selection?: PdPlanSelection | null;

  /** Plan still streaming in. */
  streaming?: boolean;
  onApprove: (editedSteps: string[]) => void;
  onReplan: (feedback: string) => void;
  onSkip: () => void;
}

export function AgentPlanPanel({ steps, selection, streaming = false, onApprove, onReplan, onSkip }: AgentPlanPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [replanning, setReplanning] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(steps.join('\n'));
    }
  }, [steps, editing]);

  const displaySteps = editing ? draft.split('\n').map((line) => line.trim()).filter(Boolean) : steps;
  const canApprove = !streaming && displaySteps.length > 0;

  const commitEdit = () => {
    setEditing(false);
  };

  return (
    <div
      data-testid="agent-plan-panel"
      className="my-2 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm"
    >
      <div className="flex items-center gap-2 mb-3 text-bolt-elements-textPrimary font-medium">
        <span className="i-ph:clipboard-text text-base" />
        PD 需求清单
        {selection?.templateName && (
          <span className="text-xs text-bolt-elements-textTertiary font-normal">
            起步模板：{selection.templateName}
            {selection.title ? `（${selection.title}）` : ''}
          </span>
        )}
        {streaming && <span className="text-xs text-bolt-elements-textTertiary font-normal">生成中…</span>}
        {collapsed && !streaming && (
          <span className="text-xs text-bolt-elements-textTertiary font-normal">{displaySteps.length} 步</span>
        )}
        <button
          type="button"
          data-testid="agent-plan-collapse"
          aria-label={collapsed ? '展开步骤' : '折叠步骤'}
          className="ml-auto p-1 rounded-md text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className={classNames('inline-block', collapsed ? 'i-ph:caret-down' : 'i-ph:caret-up')} />
        </button>
      </div>

      {!collapsed &&
        (editing ? (
        <textarea
          data-testid="agent-plan-edit"
          className="w-full min-h-[120px] p-2 mb-3 rounded-md border border-bolt-elements-borderColor bg-transparent text-sm text-bolt-elements-textPrimary outline-none resize-y"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="每行一个步骤"
        />
      ) : (
        <ol className="list-decimal pl-5 mb-3 space-y-1 text-bolt-elements-textSecondary">
          {displaySteps.length === 0 ? (
            <li className="text-bolt-elements-textTertiary list-none">
              {streaming ? '正在等待步骤…' : '（没有解析到可用步骤）'}
            </li>
          ) : (
            displaySteps.map((step, index) => <li key={index}>{step}</li>)
          )}
        </ol>
        ))}

      {!collapsed && replanning && (
        <div className="mb-3">
          <textarea
            data-testid="agent-plan-feedback"
            className="w-full min-h-[64px] p-2 mb-2 rounded-md border border-bolt-elements-borderColor bg-transparent text-sm text-bolt-elements-textPrimary outline-none resize-y"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="告诉 PD 需要怎么调整（可选）"
          />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="agent-plan-replan-confirm"
              className="px-3 py-1.5 rounded-md bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent text-xs"
              onClick={() => {
                setReplanning(false);
                onReplan(feedback.trim());
              }}
            >
              确认重新规划
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
              onClick={() => setReplanning(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {!replanning && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="agent-plan-approve"
            disabled={!canApprove}
            className={classNames(
              'px-3 py-1.5 rounded-md text-xs bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
              canApprove ? '' : 'opacity-50 cursor-not-allowed',
            )}
            onClick={() => onApprove(displaySteps)}
          >
            批准并生成
          </button>
          <button
            type="button"
            data-testid="agent-plan-edit-toggle"
            disabled={streaming}
            className="px-3 py-1.5 rounded-md text-xs border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            onClick={() => {
              if (editing) {
                commitEdit();
              } else {
                setCollapsed(false);
                setEditing(true);
              }
            }}
          >
            {editing ? '完成编辑' : '编辑'}
          </button>
          <button
            type="button"
            data-testid="agent-plan-replan"
            disabled={streaming}
            className="px-3 py-1.5 rounded-md text-xs border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            onClick={() => setReplanning(true)}
          >
            带反馈重新规划
          </button>
          <button
            type="button"
            data-testid="agent-plan-skip"
            className="px-3 py-1.5 rounded-md text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
            onClick={onSkip}
          >
            跳过直接生成
          </button>
        </div>
      )}
    </div>
  );
}
