import { useStore } from '@nanostores/react';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  generationTelemetry,
  type TelemetryActionRecord,
  type TelemetryAnnotationValue,
  type TelemetryInterrupt,
  type TelemetryPreview,
  type TelemetryRound,
  type TelemetrySource,
} from './telemetry';

/*
 * add-generation-telemetry (tasks 6.1/6.2): dev-only waterfall panel. Rendered
 * only when A2_ENABLE_GENERATION_TELEMETRY is on; collection itself is always
 * active, this component is pure presentation (design D6).
 */

const COLORS = {
  wait: '#6b7280',
  stream: '#3b82f6',
  file: '#22c55e',
  install: '#f59e0b',
  start: '#a855f7',
  other: '#eab308',
  preview: '#06b6d4',
  interrupt: '#ef4444',
};

const INTERRUPT_LABELS: Record<string, string> = {
  'llm-error': 'LLM 错误',
  abort: '用户中止',
  'segment-limit': '续写段数上限',
  'unclosed-artifact': '未闭合产物',
};

const ACTION_LABELS: Record<string, string> = {
  file: '写文件',
  install: '安装依赖',
  start: '启动服务',
  other: '命令',
};

interface DisplayAction {
  id: string;
  label: string;
  color: string;
  offsetMs: number;
  durationMs?: number;
  status: string;
  exitCode?: number;
  command?: string;
}

interface DisplayRound {
  key: string;
  source: TelemetrySource;
  status: string;
  persisted: boolean;
  startedAt: number;
  totalMs: number;
  waitMs?: number;
  streamMs?: number;
  tailMs?: number;
  actions: DisplayAction[];
  preview?: TelemetryPreview;
  previewOffsetMs?: number;
  interrupts: Array<{ kind: string; offsetMs: number }>;
  webcontainerBootMs?: number;
}

function actionLabel(action: TelemetryActionRecord): string {
  if (action.type === 'file') {
    return ACTION_LABELS.file;
  }

  return ACTION_LABELS[action.commandClass ?? 'other'];
}

function actionColor(action: TelemetryActionRecord): string {
  if (action.type === 'file') {
    return COLORS.file;
  }

  const classKey = action.commandClass ?? 'other';

  return COLORS[classKey as keyof typeof COLORS] ?? COLORS.other;
}

/** Normalize a live collector round into the panel display model. */
function fromLiveRound(round: TelemetryRound): DisplayRound {
  const waitMs = round.firstTokenAt !== undefined ? Math.max(0, round.firstTokenAt - round.startedAt) : undefined;
  const streamMs =
    round.streamEndedAt !== undefined
      ? Math.max(0, round.streamEndedAt - (round.firstTokenAt ?? round.startedAt))
      : undefined;
  const tailMs =
    round.streamEndedAt !== undefined && round.finalizedAt !== undefined
      ? Math.max(0, round.finalizedAt - round.streamEndedAt)
      : undefined;

  const lastActionEnd = round.actions.reduce((max, action) => {
    if (action.durationMs === undefined) {
      return max;
    }

    return Math.max(max, action.startedAt - round.startedAt + action.durationMs);
  }, 0);

  const previewOffsetMs = round.preview.openedAt !== undefined ? round.preview.openedAt - round.startedAt : undefined;

  const totalMs = Math.max(
    1,
    (waitMs ?? 0) + (streamMs ?? 0) + (tailMs ?? 0),
    lastActionEnd,
    previewOffsetMs ?? 0,
    round.status === 'finalized' && round.finalizedAt !== undefined ? round.finalizedAt - round.startedAt : 0,
  );

  return {
    key: `live-${round.messageId}`,
    source: round.source,
    status: round.status,
    persisted: false,
    startedAt: round.startedAt,
    totalMs,
    waitMs,
    streamMs,
    tailMs,
    actions: round.actions.map((action) => ({
      id: action.id,
      label: actionLabel(action),
      color: actionColor(action),
      offsetMs: Math.max(0, action.startedAt - round.startedAt),
      durationMs: action.durationMs,
      status: action.status,
      exitCode: action.exitCode,
      command: action.command,
    })),
    preview: round.preview,
    previewOffsetMs,
    interrupts: round.interrupts.map((interrupt: TelemetryInterrupt) => ({
      kind: interrupt.kind,
      offsetMs: Math.max(0, interrupt.at - round.startedAt),
    })),
    webcontainerBootMs: round.webcontainerBootMs,
  };
}

/** Normalize a persisted telemetry annotation into the panel display model. */
function fromAnnotation(value: TelemetryAnnotationValue, index: number): DisplayRound {
  const { phases } = value;
  const phaseTotal = (phases.waitMs ?? 0) + (phases.streamMs ?? 0) + (phases.tailMs ?? 0);

  const lastActionEnd = value.actions.reduce((max, action) => {
    if (action.durationMs === undefined) {
      return max;
    }

    return Math.max(max, action.startedAt - value.startedAt + action.durationMs);
  }, 0);

  const previewOffsetMs = value.preview.openedAt !== undefined ? value.preview.openedAt - value.startedAt : undefined;

  const totalMs = Math.max(1, phaseTotal, lastActionEnd, previewOffsetMs ?? 0);

  return {
    key: `persisted-${value.startedAt}-${index}`,
    source: value.source,
    status: 'finalized',
    persisted: true,
    startedAt: value.startedAt,
    totalMs,
    waitMs: phases.waitMs,
    streamMs: phases.streamMs,
    tailMs: phases.tailMs,
    actions: value.actions.map((action) => ({
      id: action.id,
      label: actionLabel(action),
      color: actionColor(action),
      offsetMs: Math.max(0, action.startedAt - value.startedAt),
      durationMs: action.durationMs,
      status: action.status,
      exitCode: action.exitCode,
      command: action.command,
    })),
    preview: value.preview,
    previewOffsetMs,
    interrupts: value.interrupts.map((interrupt) => ({
      kind: interrupt.kind,
      offsetMs: Math.max(0, interrupt.at - value.startedAt),
    })),
    webcontainerBootMs: value.webcontainerBootMs,
  };
}

function formatMs(ms?: number): string {
  if (ms === undefined) {
    return '-';
  }

  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  left: 16,
  bottom: 16,
  zIndex: 90,
  width: 440,
  maxHeight: '55vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(24, 26, 32, 0.96)',
  color: '#e5e7eb',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
};

function RoundRow({ round }: { round: DisplayRound }) {
  const pct = (ms: number) => `${Math.min(100, (ms / round.totalMs) * 100)}%`;
  const width = (ms?: number) => `${Math.max(0.4, ((ms ?? 0) / round.totalMs) * 100)}%`;

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid #2d3138' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>
          <span
            style={{
              padding: '0 6px',
              borderRadius: 4,
              marginRight: 6,
              background: round.source === 'fresh' ? '#1d4ed8' : '#52525b',
            }}
          >
            {round.source === 'fresh' ? '实时' : '重放'}
          </span>
          {round.persisted ? '已持久化' : round.status}
          {round.webcontainerBootMs !== undefined ? ` · Boot ${formatMs(round.webcontainerBootMs)}` : ''}
        </span>
        <span>总 {formatMs(round.totalMs)}</span>
      </div>

      {/* phase bar: wait / stream / tail */}
      <div style={{ position: 'relative', height: 10, background: '#1f232a', borderRadius: 4, marginBottom: 4 }}>
        {round.waitMs !== undefined && (
          <div
            title={`等待 ${formatMs(round.waitMs)}`}
            style={{
              position: 'absolute',
              left: 0,
              width: width(round.waitMs),
              height: '100%',
              background: COLORS.wait,
              borderRadius: 4,
            }}
          />
        )}
        {round.streamMs !== undefined && (
          <div
            title={`流式 ${formatMs(round.streamMs)}`}
            style={{
              position: 'absolute',
              left: pct(round.waitMs ?? 0),
              width: width(round.streamMs),
              height: '100%',
              background: COLORS.stream,
            }}
          />
        )}
        {round.tailMs !== undefined && (
          <div
            title={`尾巴 ${formatMs(round.tailMs)}`}
            style={{
              position: 'absolute',
              left: pct((round.waitMs ?? 0) + (round.streamMs ?? 0)),
              width: width(round.tailMs),
              height: '100%',
              background: '#9ca3af',
              opacity: 0.6,
            }}
          />
        )}
        {round.interrupts.map((interrupt, i) => (
          <div
            key={i}
            title={`中断：${INTERRUPT_LABELS[interrupt.kind] ?? interrupt.kind} @ ${formatMs(interrupt.offsetMs)}`}
            style={{
              position: 'absolute',
              left: pct(interrupt.offsetMs),
              top: -2,
              width: 3,
              height: 14,
              background: COLORS.interrupt,
            }}
          />
        ))}
      </div>

      {/* action lanes */}
      {round.actions.map((action) => (
        <div
          key={action.id}
          title={`${action.label}${action.command ? `：${action.command}` : ''} · ${action.status}${
            action.exitCode !== undefined ? ` · exit ${action.exitCode}` : ''
          }`}
          style={{ position: 'relative', height: 8, background: '#1f232a', borderRadius: 3, marginBottom: 2 }}
        >
          <div
            style={{
              position: 'absolute',
              left: pct(action.offsetMs),
              width: width(action.durationMs ?? 40),
              height: '100%',
              background: action.color,
              opacity: action.status === 'running' ? 0.5 : 1,
              borderRadius: 3,
            }}
          />
        </div>
      ))}

      {/* footer stats */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4, color: '#9ca3af' }}>
        <span>等待 {formatMs(round.waitMs)}</span>
        <span>流式 {formatMs(round.streamMs)}</span>
        <span>尾巴 {formatMs(round.tailMs)}</span>
        {round.preview?.startToPreviewMs !== undefined && (
          <span style={{ color: COLORS.preview }}>启动→预览 {formatMs(round.preview.startToPreviewMs)}</span>
        )}
        {round.preview?.timeout && <span style={{ color: COLORS.interrupt }}>预览超时</span>}
      </div>
    </div>
  );
}

export function GenerationTelemetryPanel({
  persistedAnnotations,
}: {
  persistedAnnotations: TelemetryAnnotationValue[];
}) {
  const liveRounds = useStore(generationTelemetry.rounds);
  const [collapsed, setCollapsed] = useState(false);

  const rounds = useMemo(() => {
    const live = Object.values(liveRounds).map(fromLiveRound);
    const persisted = persistedAnnotations.map(fromAnnotation);

    /*
     * A persisted annotation and a live replay round for the same message are
     * both interesting (original vs re-execution), so keep both; sort newest
     * first by start time.
     */
    return [...live, ...persisted].sort((a, b) => b.startedAt - a.startedAt);
  }, [liveRounds, persistedAnnotations]);

  if (collapsed) {
    return (
      <button
        style={{ ...panelStyle, width: 'auto', maxHeight: 'none', padding: '6px 12px' }}
        onClick={() => setCollapsed(false)}
      >
        生成遥测（{rounds.length}）
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #2d3138',
        }}
      >
        <strong>生成链路遥测（{rounds.length} 轮）</strong>
        <button
          style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer' }}
          onClick={() => setCollapsed(true)}
        >
          收起
        </button>
      </div>
      <div style={{ overflowY: 'auto' }}>
        {rounds.length === 0 ? (
          <div style={{ padding: '12px', color: '#9ca3af' }}>暂无轮次数据</div>
        ) : (
          rounds.map((round) => <RoundRow key={round.key} round={round} />)
        )}
      </div>
    </div>
  );
}
