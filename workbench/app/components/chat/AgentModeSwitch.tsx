/*
 * add-multi-agent-team (task 3.1, design D6 / MA-02): two-state agent mode
 * pill left of the send button. Rendered for the whole conversation
 * lifecycle; disabled while a TL orchestration is active. Gated by the
 * A2_ENABLE_MULTI_AGENT_MODE flag at the mount site.
 */
import * as Tooltip from '@radix-ui/react-tooltip';
import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { A2_AGENT_MODE_COOKIE_KEY, type AgentMode } from '~/a2/multi-agent/pd-planner';

export function readAgentModeCookie(): AgentMode {
  return Cookies.get(A2_AGENT_MODE_COOKIE_KEY) === 'multi' ? 'multi' : 'single';
}

interface AgentModeSwitchProps {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;

  /** TL orchestration active: visible but disabled (MA-02). */
  disabled?: boolean;
}

export function AgentModeSwitch({ mode, onChange, disabled = false }: AgentModeSwitchProps) {
  const [, forceRender] = useState(0);

  useEffect(() => {
    forceRender((n) => n + 1);
  }, []);

  const select = (next: AgentMode) => {
    if (disabled || next === mode) {
      return;
    }

    onChange(next);
    Cookies.set(A2_AGENT_MODE_COOKIE_KEY, next, { expires: 365 });
  };

  const tooltip = disabled ? '编排进行中，终止后可切换' : '选择生成模式：单智能体直接生成，多智能体先规划再逐步执行';

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div
          data-testid="agent-mode-switch"
          className={classNames(
            'flex items-center gap-0.5 mr-2 p-0.5 rounded-full border border-bolt-elements-borderColor text-xs select-none',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          )}
        >
          <button
            type="button"
            data-testid="agent-mode-single"
            disabled={disabled}
            className={classNames(
              'px-2 py-0.5 rounded-full transition-colors',
              mode === 'single'
                ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            )}
            onClick={() => select('single')}
          >
            单智能体
          </button>
          <button
            type="button"
            data-testid="agent-mode-multi"
            disabled={disabled}
            className={classNames(
              'px-2 py-0.5 rounded-full transition-colors',
              mode === 'multi'
                ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            )}
            onClick={() => select('multi')}
          >
            多智能体
          </button>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={8}
          className="px-3 py-2 rounded-md bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor text-xs text-bolt-elements-textSecondary max-w-[240px] z-[100]"
        >
          {tooltip}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
