/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll, flushMessageParse } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { A2_ENABLE_GENERATION_TELEMETRY, A2_ENABLE_PROVIDER_SWITCH, A2_ENABLE_RESPONSE_STATS, isMultiAgentModeEnabled } from '~/a2/config';
import { generationTelemetry, type TelemetryAnnotationValue } from '~/a2/telemetry';
import { GenerationTelemetryPanel } from '~/a2/generation-telemetry-panel';

/*
 * add-multi-agent-team (G5 integration): TL + PD pipeline. All of it is
 * flag/mode gated; single-agent paths below remain byte-for-byte intact.
 */
import { A2_AGENT_MODE_COOKIE_KEY, type AgentMode, type PdPlanStepContext } from '~/a2/multi-agent/pd-planner';
import { parsePdPlanOutput } from '~/a2/multi-agent/pd-plan-parser';
import { buildStepInstruction } from '~/a2/multi-agent/buildStepInstruction';
import { triageIterationMessage, type TriageOutcome } from '~/a2/multi-agent/triage';
import { getEffectivePlan, isPlanAnnotation } from '~/a2/multi-agent/plan-model';
import { useTlOrchestrator } from '~/a2/multi-agent/useTlOrchestrator';
import { AgentModeSwitch, readAgentModeCookie } from './AgentModeSwitch';
import { usePdPlan } from './usePdPlan';
import { AgentPlanPanel } from './AgentPlanPanel';
import { TlProgressPanel } from './TlProgressPanel';
import type { RequestStatus } from './ResponseStats';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

/*
 * add-multi-agent-team (G5): context captured when a message enters the team
 * flow, so gate/triage callbacks firing in later renders still know what to
 * send. D11-3: the user message is NOT inserted while planning is running.
 */
interface PendingGen {
  mode: 'first' | 'incremental';
  input: string;
  imageData: string[];
  fileTree?: string[];
  currentPlan?: PdPlanStepContext[];
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]); // Move here
    const [imageDataList, setImageDataList] = useState<string[]>([]); // Move here
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const actionAlert = useStore(workbenchStore.alert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();

    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');

      /*
       * A2 (design D6 / LG-04, task 6.3): with provider switching off, ignore
       * any stale cookie value and always use the platform default model.
       */
      return A2_ENABLE_PROVIDER_SWITCH ? savedModel || DEFAULT_MODEL : DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (
        A2_ENABLE_PROVIDER_SWITCH
          ? PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER
          : DEFAULT_PROVIDER
      ) as ProviderInfo;
    });

    const { showChat } = useStore(chatStore);

    const [animationScope, animate] = useAnimate();

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

    /*
     * chat-response-stats (design D2): staged request lifecycle derived from
     * useChat signals; idle → submitting → waiting → streaming → finished/error.
     */
    const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
    const requestStartedAtRef = useRef<number | undefined>(undefined);

    const beginRequestTracking = () => {
      requestStartedAtRef.current = Date.now();
      setRequestStatus('submitting');

      // add-generation-telemetry: round-0 boundary (user sent a message; assistant id unknown yet)
      generationTelemetry.beginRequest();
    };

    const { messages, isLoading, input, handleInputChange, setInput, stop, append, setMessages, reload } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
      },
      sendExtraMessageFields: true,
      onResponse: () => {
        setRequestStatus('waiting');
      },
      onError: (error) => {
        logger.error('Request failed\n\n', error);
        toast.error(
          'There was an error processing your request: ' + (error.message ? error.message : 'No details were returned'),
        );
        setRequestStatus('error');

        // add-generation-telemetry (task 4.2): LLM request failure (also covers the segment-limit throw)
        generationTelemetry.interruptActiveRound('llm-error');

        // add-multi-agent-team (TL-04): stream error during an orchestrated round pauses immediately
        tl.onRoundError(error?.message);

        /*
         * chat-response-stats (design D4 / task 4.3): the server threw before
         * any annotation arrived, so record the failure on the assistant
         * message client-side and persist it explicitly (the sampled save may
         * skip it because the message count did not grow).
         */
        if (A2_ENABLE_RESPONSE_STATS) {
          const errorMessage = error?.message || 'No details were returned';
          const annotation = { type: 'status', value: { status: 'error', message: errorMessage, at: Date.now() } };
          const last = messages[messages.length - 1];

          let next;

          if (last && last.role === 'assistant') {
            next = messages.map((message, i) =>
              i === messages.length - 1
                ? { ...message, annotations: [...(message.annotations || []), annotation] }
                : message,
            );
          } else {
            next = [
              ...messages,
              { id: `${Date.now()}`, role: 'assistant' as const, content: '', annotations: [annotation] },
            ] as Message[];
          }

          setMessages(next as Message[]);
          storeMessageHistory(next as Message[]).catch((error) => toast.error(error.message));
        }
      },
      onFinish: (message, response) => {
        const usage = response.usage;

        if (usage) {
          console.log('Token usage:', usage);

          // You can now use the usage data as needed
        }

        setRequestStatus('finished');
        logger.debug('Finished streaming');

        /*
         * add-generation-telemetry (tasks 3.3/4.1/4.2): close the fresh round.
         * Server-authoritative timing comes from the WB-09 usage annotation;
         * a missing usage annotation implies the segment-limit interruption
         * (design D4). The parser open state detects unclosed artifacts.
         */
        const annotations = (message.annotations ?? []) as Array<{ type?: string; value?: any }>;
        const usageAnnotation = annotations.find((annotation) => annotation?.type === 'usage');
        const openState = flushMessageParse(message.id, typeof message.content === 'string' ? message.content : '');

        if (!usageAnnotation) {
          generationTelemetry.recordInterrupt('segment-limit');
        }

        void generationTelemetry.streamEnd(message.id, {
          unclosed: openState.insideArtifact || openState.insideAction,
          serverTiming: usageAnnotation?.value?.timing,
        });

        /*
         * add-multi-agent-team (task 5.2 / TL-02): stream end of an
         * orchestrated step round hands control to the TL settle watch; a
         * no-op for direct-path rounds (phase guard inside the hook).
         */
        tl.onRoundFinished(message.id);
      },
      initialMessages,

      /*
       * A2 UX: pre-fill the prompt with a sensible default so first-time users
       * land on a ready-to-send example instead of an empty box. Only applies
       * to new chats (no existing messages); cached drafts still win so a page
       * refresh never clobbers in-progress typing.
       */
      initialInput:
        Cookies.get(PROMPT_COOKIE_KEY) || (initialMessages.length === 0 ? '创建一个漂亮的个人介绍网页' : ''),
    });

    /*
     * chat-response-stats (design D2): waiting → thinking → streaming. With
     * dashscope-reasoning-stream, the first reasoning annotation marks the
     * thinking state (TTRT tap); the first visible content delta marks
     * streaming (TTFT tap).
     */
    useEffect(() => {
      if (requestStatus !== 'waiting' && requestStatus !== 'thinking') {
        return;
      }

      const last = messages[messages.length - 1];

      if (!last || last.role !== 'assistant') {
        return;
      }

      if ((last.content?.length || 0) > 0) {
        setRequestStatus('streaming');

        // add-generation-telemetry: bind the round to the assistant message and mark the first visible token
        generationTelemetry.startRound(last.id);
        generationTelemetry.markFirstToken();

        return;
      }

      const hasReasoning = ((last.annotations ?? []) as Array<{ type?: string }>).some(
        (annotation) => annotation?.type === 'reasoning',
      );

      if (requestStatus === 'waiting' && hasReasoning) {
        setRequestStatus('thinking');

        // dashscope-reasoning-stream (task 8.1): TTRT tap, paired with the thinking transition
        generationTelemetry.markFirstReasoningToken(last.id);
      }
    }, [requestStatus, messages]);
    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        beginRequestTracking();
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
            },
          ] as any, // Type assertion to bypass compiler check
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    /*
     * add-generation-telemetry (task 5.1): finalized fresh rounds persist as a
     * telemetry annotation on the assistant message through the existing
     * message persistence channel. Rounds can finalize up to 30s after the
     * stream (preview grace window), so read messages through a ref.
     */
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    useEffect(() => {
      generationTelemetry.setPersistHandler(async (messageId, annotation) => {
        const current = messagesRef.current;
        const index = current.findIndex((message) => message.id === messageId);

        if (index === -1) {
          return;
        }

        const next = current.map((message, i) =>
          i === index ? { ...message, annotations: [...(message.annotations || []), annotation] } : message,
        ) as Message[];

        setMessages(next);
        await storeMessageHistory(next);
      });

      return () => {
        generationTelemetry.setPersistHandler(undefined);
      };
    }, [setMessages, storeMessageHistory]);

    /* ------------------------------------------------------------------ *
     * add-multi-agent-team (G5 integration, design D4/D6/D11-D15): mode   *
     * switch state, PD planning round, TL orchestrator, iteration triage, *
     * and the approve/gate handoff. Everything below is gated on the flag *
     * and the multi mode; the single-agent paths are untouched.           *
     * ------------------------------------------------------------------ */
    const multiAgentAvailable = isMultiAgentModeEnabled();

    const [agentMode, setAgentModeState] = useState<AgentMode>(() =>
      multiAgentAvailable ? readAgentModeCookie() : 'single',
    );

    const setAgentMode = (mode: AgentMode) => {
      setAgentModeState(mode);
      Cookies.set(A2_AGENT_MODE_COOKIE_KEY, mode, { expires: 365 });
    };

    const pdPlan = usePdPlan();
    const pendingGenRef = useRef<PendingGen | undefined>(undefined);

    /** TL → Engineer: one hidden user instruction per step round (D10). */
    const runStepRound = (instruction: string) => {
      beginRequestTracking();
      append({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${instruction}`,
          },
        ] as any, // Type assertion to bypass compiler check
        annotations: ['hidden'],
      });
    };

    /** TL-05: deterministic wrap-up assistant message, persisted like any other. */
    const appendWrapUpMessage = (summary: string) => {
      const annotation = { type: 'tl-wrapup', value: { role: 'tl', at: Date.now() } };
      const next = [
        ...messagesRef.current,
        { id: `${Date.now()}`, role: 'assistant' as const, content: summary, annotations: [annotation] },
      ] as Message[];

      setMessages(next);
      storeMessageHistory(next).catch((error) => toast.error(error.message));
    };

    const tl = useTlOrchestrator({
      runStepRound,
      appendWrapUpMessage,

      // task 6.1: tag each orchestrated round with its 1-based step index
      onStepRoundStart: (stepIndex) => generationTelemetry.beginPhase('exec', stepIndex + 1),
    });

    /*
     * Triage decision (D13): the outcome is briefly visible with one-click
     * override buttons; a timer auto-proceeds unless the user overrides.
     */
    const [triageDecision, setTriageDecision] = useState<{ outcome: TriageOutcome } | undefined>(undefined);
    const triageTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const clearTriageTimer = () => {
      if (triageTimerRef.current !== undefined) {
        clearTimeout(triageTimerRef.current);
        triageTimerRef.current = undefined;
      }
    };

    /** Direct path for team-flow fall-backs (simple append + input cleanup). */
    const appendDirectMessage = (_input: string) => {
      beginRequestTracking();
      append({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${_input}`,
          },
        ] as any, // Type assertion to bypass compiler check
      });
      setInput('');
      setUploadedFiles([]);
      setImageDataList([]);
    };

    /** D14: truncated workspace file tree + effective plan state. */
    const collectFileTree = (): string[] =>
      Object.entries(files)
        .filter(([, dirent]) => dirent?.type === 'file')
        .map(([path]) => path)
        .slice(0, 120);

    const collectCurrentPlan = (): PdPlanStepContext[] => {
      const effective = getEffectivePlan(messagesRef.current);

      if (!effective) {
        return [];
      }

      return effective.annotation.value.steps.map((step) => ({
        text: step.text,
        status: step.status === 'done' || step.status === 'skipped' ? step.status : 'pending',
      }));
    };

    /** PD incremental planning round for a major iteration change (D13/D14). */
    const runIncrementalPlan = async (pending: PendingGen, feedback?: string) => {
      tl.startPlanning();
      setRequestStatus('planning');

      const round = await pdPlan.startPlan({
        mode: 'incremental',
        message: pending.input,
        feedback,
        fileTree: pending.fileTree,
        currentPlan: pending.currentPlan,
      });

      if (round.outcome === 'skipped') {
        tl.reset();
        setRequestStatus('idle');
        appendDirectMessage(pending.input);
        return;
      }

      if (round.outcome === 'error' || !round.text) {
        toast.warning('PD 增量规划失败，已降级为直接生成');
        tl.reset();
        setRequestStatus('idle');
        appendDirectMessage(pending.input);
        return;
      }

      const parsed = parsePdPlanOutput(round.text);

      if (parsed.steps.length === 0) {
        toast.warning('计划解析失败，已降级为直接生成');
        tl.reset();
        setRequestStatus('idle');
        appendDirectMessage(pending.input);
        return;
      }

      tl.proposePlan(parsed.steps);
      setRequestStatus('plan_proposed');
    };

    const proceedWithTriage = (forced?: TriageOutcome) => {
      clearTriageTimer();

      const outcome = forced ?? triageDecision?.outcome;
      setTriageDecision(undefined);

      const pending = pendingGenRef.current;

      if (!pending || !outcome) {
        return;
      }

      if (outcome === 'trivial') {
        appendDirectMessage(pending.input);
        return;
      }

      void runIncrementalPlan(pending);
    };

    /*
     * Gate handoff (D4): build the message sequence — visible user prompt,
     * plan assistant message with {type:'plan'} annotation, optional template
     * artifact (fetched only after approval, D7), hidden step-1 instruction —
     * then setMessages + reload(). The orchestrator drives later rounds.
     */
    const handleApprovePlan = async (editedSteps: string[]) => {
      const pending = pendingGenRef.current;

      if (!pending || tl.phase !== 'gate') {
        return;
      }

      const selection = pending.mode === 'first' ? pdPlan.selection : null;

      let templateMessages: Message[] = [];

      // D7: GitHub template fetch happens only after the user approved.
      if (selection && selection.templateName && selection.templateName !== 'blank') {
        const temResp = await getTemplates(selection.templateName, selection.title).catch((e) => {
          if (e.message.includes('rate limit') || e.message.includes('403') || e.message.includes('429')) {
            toast.warning('模板拉取受限（GitHub 限流），改用空白模板继续');
          } else {
            toast.warning('模板拉取失败，改用空白模板继续');
          }

          return null;
        });

        if (temResp) {
          templateMessages = [
            {
              id: `${Date.now()}-template`,
              role: 'assistant',
              content: temResp.assistantMessage,
            },
            {
              id: `${Date.now()}-template-instruction`,
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${temResp.userMessage}`,
              annotations: ['hidden'],
            },
          ] as Message[];
        }
      }

      // D15: living document — incremental plans bump the gen version.
      const lastGen = getEffectivePlan(messagesRef.current)?.annotation.value.gen ?? 0;
      const gen = pending.mode === 'first' ? 1 : lastGen + 1;

      const timing = pdPlan.timing?.endedAt
        ? { startedAt: pdPlan.timing.startedAt, firstTokenAt: pdPlan.timing.firstTokenAt, endedAt: pdPlan.timing.endedAt }
        : undefined;

      const planAnnotation = {
        type: 'plan',
        value: { role: 'pd', gen, steps: editedSteps.map((text) => ({ text })), selection, timing },
      };

      const planContent = `PD 计划（共 ${editedSteps.length} 步）：\n${editedSteps
        .map((text, index) => `${index + 1}. ${text}`)
        .join('\n')}`;

      const stepInstruction = buildStepInstruction(editedSteps.map((text) => ({ text })), 0);

      const userMessage = {
        id: `${Date.now()}-prompt`,
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${pending.input}`,
          },
          ...pending.imageData.map((imageData) => ({ type: 'image', image: imageData })),
        ] as any, // Type assertion to bypass compiler check
      };

      const baseMessages = pending.mode === 'first' ? [] : messagesRef.current;
      const planMessageId = `${Date.now()}-plan`;

      const sequence = [
        ...baseMessages,
        userMessage,
        {
          id: planMessageId,
          role: 'assistant',
          content: planContent,
          annotations: [planAnnotation],
        },
        ...templateMessages,
      ] as Message[];

      /*
       * task 6.1: the planning round is a no-action round finalized
       * immediately (persist timing from the PD stream); the step-1 round
       * launched below is tagged exec/step 1.
       */
      if (pdPlan.timing) {
        generationTelemetry.recordPlanRound(planMessageId, pdPlan.timing);
      }

      generationTelemetry.beginPhase('exec', 1);
      tl.approve();
      setMessages(sequence);

      /*
       * ai-SDK v4 `reload()` drops a trailing user message from the request,
       * so the hidden step-1 instruction must be launched through `append`
       * (runStepRound), which includes the appended message in the request.
       */
      runStepRound(stepInstruction);
    };

    const handleReplan = (feedback: string) => {
      const pending = pendingGenRef.current;

      if (!pending) {
        return;
      }

      setRequestStatus('planning');
      tl.startPlanning();

      void pdPlan
        .startPlan({
          mode: pending.mode,
          message: pending.input,
          feedback,
          fileTree: pending.fileTree,
          currentPlan: pending.currentPlan,
        })
        .then((round) => {
          if (round.outcome !== 'done' || !round.text) {
            return;
          }

          const parsed = parsePdPlanOutput(round.text);

          if (parsed.steps.length === 0) {
            return;
          }

          tl.proposePlan(parsed.steps);
          setRequestStatus('plan_proposed');
        });
    };

    /** Gate escape (MA-05): user-only 跳过 → direct generation. */
    const handleSkipGate = () => {
      const pending = pendingGenRef.current;

      if (pdPlan.phase === 'streaming') {
        // sendMessage await resumes and degrades to the direct path.
        pdPlan.skip();
        return;
      }

      tl.reset();
      pdPlan.reset();
      setRequestStatus('idle');

      if (pending) {
        appendDirectMessage(pending.input);
      }
    };

    /*
     * D15: write step completion state back into the effective plan
     * annotation when the orchestration reaches a terminal phase.
     */
    useEffect(() => {
      if (tl.phase !== 'completed' && tl.phase !== 'terminated') {
        return;
      }

      if (tl.steps.length === 0) {
        return;
      }

      const current = messagesRef.current;
      const effective = getEffectivePlan(current);

      if (!effective) {
        return;
      }

      const statusMap = tl.steps.map(({ text, status }) => ({ text, status }));

      const next = current.map((message) => {
        if (message.id !== effective.message.id) {
          return message;
        }

        return {
          ...message,
          annotations: ((message.annotations ?? []) as unknown[]).map((annotation) =>
            isPlanAnnotation(annotation) && annotation.value.gen === effective.annotation.value.gen
              ? { ...annotation, value: { ...annotation.value, steps: statusMap } }
              : annotation,
          ),
        };
      }) as Message[];

      setMessages(next);
      storeMessageHistory(next).catch((error) => toast.error(error.message));
    }, [tl.phase]);

    const orchestrationActive = ['planning', 'gate', 'executing', 'settling', 'paused'].includes(tl.phase);

    /*
     * Panels shown above the prompt box: plan review card during
     * planning/gate, TL progress panel once a plan is approved.
     */
    const multiAgentPanel = multiAgentAvailable ? (
      <>
        {triageDecision && (
          <div
            className="flex items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm"
            data-testid="triage-decision"
          >
            <span className="text-bolt-elements-textPrimary">
              {triageDecision.outcome === 'trivial' ? '判断为小改动，将直接生成' : '判断为大改动，将先进入规划'}
            </span>
            <button
              className="px-2 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              onClick={() => proceedWithTriage(triageDecision.outcome === 'trivial' ? 'major' : 'trivial')}
              data-testid="triage-override"
            >
              {triageDecision.outcome === 'trivial' ? '先规划' : '直接生成'}
            </button>
          </div>
        )}
        {(tl.phase === 'planning' || tl.phase === 'gate') && pdPlan.phase !== 'idle' && (
          <AgentPlanPanel
            steps={pdPlan.steps}
            selection={pdPlan.selection}
            streaming={pdPlan.phase === 'streaming'}
            onApprove={(editedSteps) => void handleApprovePlan(editedSteps)}
            onReplan={handleReplan}
            onSkip={handleSkipGate}
          />
        )}
        {!['idle', 'planning', 'gate'].includes(tl.phase) && (
          <TlProgressPanel
            phase={tl.phase}
            steps={tl.steps}
            currentIndex={tl.currentIndex}
            failReason={tl.failReason}
            onRetryStep={tl.retryStep}
            onSkipStep={tl.skipStep}
            onTerminate={tl.terminate}
          />
        )}
      </>
    ) : undefined;

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();

      // add-generation-telemetry (task 4.2): user abort ends the stream; aborted actions then drain the round
      generationTelemetry.interruptActiveRound('abort');

      /*
       * add-multi-agent-team (task 5.3 / TL-06): Stop during orchestration
       * terminates it; during a PD planning stream it degrades to skip so the
       * pending sendMessage resumes on the direct path.
       */
      if (tl.phase === 'planning') {
        pdPlan.skip();
      } else {
        tl.terminate();
      }

      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();
    };

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      /*
       * A2: the #examples / #intro blocks below the prompt box were removed from
       * the home page, so animate() them would never resolve and chatStarted
       * would stay false (messages and workbench never render). Animate only
       * elements that still exist.
       */
      const animations = [animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn })];

      if (document.querySelector('#examples')) {
        animations.unshift(animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }));
      }

      await Promise.all(animations);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const _input = messageInput || input;

      if (_input.length === 0 || isLoading) {
        return;
      }

      /*
       * chat-response-stats (task 3.1): mark the request start for the live
       * waiting/streaming feedback; covers every downstream append/reload path.
       */
      beginRequestTracking();

      /**
       * @note (delm) Usually saving files shouldn't take long but it may take longer if there
       * many unsaved files. In that case we need to block user input and show an indicator
       * of some kind so the user is aware that something is happening. But I consider the
       * happy case to be no unsaved files and I would expect users to save their changes
       * before they send another message.
       */
      await workbenchStore.saveAllFiles();

      const fileModifications = workbenchStore.getFileModifcations();

      chatStore.setKey('aborted', false);

      runAnimation();

      /*
       * add-multi-agent-team (task 5.1, design D11): first-generation
       * multi-agent block. Mounts independently of the autoSelectTemplate
       * branch (which is dead code in this fork); no user message is
       * pre-inserted while planning, so any degradation falls through to the
       * original append path without duplication.
       */
      if (!chatStarted && multiAgentAvailable && agentMode === 'multi') {
        pendingGenRef.current = { mode: 'first', input: _input, imageData: [...imageDataList] };
        tl.startPlanning();
        setRequestStatus('planning');

        const round = await pdPlan.startPlan({ mode: 'first', message: _input });

        if (round.outcome === 'done' && round.text) {
          const parsed = parsePdPlanOutput(round.text);

          if (parsed.steps.length > 0) {
            tl.proposePlan(parsed.steps);
            setRequestStatus('plan_proposed');
            setInput('');
            Cookies.remove(PROMPT_COOKIE_KEY);
            return;
          }

          toast.warning('计划解析失败，已降级为直接生成');
        } else if (round.outcome === 'error') {
          toast.warning('PD 规划失败，已降级为直接生成');
        }

        // skipped / unparseable / error → fall through to the direct path below
        tl.reset();
        setRequestStatus('submitting');
      }

      if (!chatStarted && messageInput && autoSelectTemplate) {
        setFakeLoading(true);
        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${_input}`,
              },
              ...imageDataList.map((imageData) => ({
                type: 'image',
                image: imageData,
              })),
            ] as any, // Type assertion to bypass compiler check
          },
        ]);

        // reload();

        const { template, title } = await selectStarterTemplate({
          message: messageInput,
          model,
          provider,
        });

        if (template !== 'blank') {
          const temResp = await getTemplates(template, title).catch((e) => {
            if (e.message.includes('rate limit')) {
              toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
            } else {
              toast.warning('Failed to import starter template\n Continuing with blank template');
            }

            return null;
          });

          if (temResp) {
            const { assistantMessage, userMessage } = temResp;

            setMessages([
              {
                id: `${new Date().getTime()}`,
                role: 'user',
                content: messageInput,

                // annotations: ['hidden'],
              },
              {
                id: `${new Date().getTime()}`,
                role: 'assistant',
                content: assistantMessage,
              },
              {
                id: `${new Date().getTime()}`,
                role: 'user',
                content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                annotations: ['hidden'],
              },
            ]);

            reload();
            setFakeLoading(false);

            return;
          } else {
            setMessages([
              {
                id: `${new Date().getTime()}`,
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${_input}`,
                  },
                  ...imageDataList.map((imageData) => ({
                    type: 'image',
                    image: imageData,
                  })),
                ] as any, // Type assertion to bypass compiler check
              },
            ]);
            reload();
            setFakeLoading(false);

            return;
          }
        } else {
          setMessages([
            {
              id: `${new Date().getTime()}`,
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${_input}`,
                },
                ...imageDataList.map((imageData) => ({
                  type: 'image',
                  image: imageData,
                })),
              ] as any, // Type assertion to bypass compiler check
            },
          ]);
          reload();
          setFakeLoading(false);

          return;
        }
      }

      /*
       * add-multi-agent-team (task 5.5, design D11-4/D13): iteration triage.
       * Multi-agent iteration messages go through the lightweight triage
       * call first: trivial → direct path; major → incremental PD planning +
       * the same gate + TL. Failure/timeout degrades to direct (never
       * blocks). The outcome is shown briefly with an override button and
       * auto-proceeds after a short delay.
       */
      if (
        chatStarted &&
        multiAgentAvailable &&
        agentMode === 'multi' &&
        ['idle', 'completed', 'terminated'].includes(tl.phase)
      ) {
        const fileTree = collectFileTree();
        const effective = getEffectivePlan(messagesRef.current);
        const projectSummary = [
          `项目文件数：${fileTree.length}`,
          effective
            ? `当前计划：${effective.annotation.value.steps.map((step) => step.text).join('；')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');

        pendingGenRef.current = {
          mode: 'incremental',
          input: _input,
          imageData: [...imageDataList],
          fileTree,
          currentPlan: collectCurrentPlan(),
        };

        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        setUploadedFiles([]);
        setImageDataList([]);

        const outcome = await triageIterationMessage({ message: _input, projectSummary, model, provider });

        if (outcome === null) {
          toast.info('分诊失败，已按小改动直接生成');
          appendDirectMessage(_input);
          return;
        }

        setTriageDecision({ outcome });
        clearTriageTimer();
        triageTimerRef.current = setTimeout(() => proceedWithTriage(outcome), 3_000);
        return;
      }

      if (fileModifications !== undefined) {
        /**
         * If we have file modifications we append a new user message manually since we have to prefix
         * the user input with the file modifications and we don't want the new user input to appear
         * in the prompt. Using `append` is almost the same as `handleSubmit` except that we have to
         * manually reset the input and we'd have to manually pass in file attachments. However, those
         * aren't relevant here.
         */
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${_input}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any, // Type assertion to bypass compiler check
        });

        /**
         * After sending a new message we reset all modifications since the model
         * should now be aware of all the changes.
         */
        workbenchStore.resetAllFileModifications();
      } else {
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${_input}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any, // Type assertion to bypass compiler check
        });
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      // Add file cleanup here
      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    const [messageRef, scrollRef] = useSnapScroll();

    /*
     * add-generation-telemetry (task 6.2): persisted telemetry annotations of
     * the loaded messages feed the dev-only panel alongside live rounds.
     */
    const persistedTelemetry = useMemo(
      () =>
        messages.flatMap((message) =>
          ((message.annotations ?? []) as Array<{ type?: string; value?: TelemetryAnnotationValue }>)
            .filter((annotation) => annotation?.type === 'telemetry')
            .map((annotation) => annotation.value as TelemetryAnnotationValue),
        ),
      [messages],
    );

    /*
     * chat-response-stats (task 3.2): visible content length of the streaming
     * assistant message, feeding the live token estimate.
     */
    const lastMessage = messages[messages.length - 1];
    const streamingContentLength =
      lastMessage && lastMessage.role === 'assistant' ? lastMessage.content?.length || 0 : 0;

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    return (
      <>
        <BaseChat
          ref={animationScope}
          textareaRef={textareaRef}
          input={input}
          showChat={showChat}
          chatStarted={chatStarted}
          isStreaming={isLoading || fakeLoading}
          enhancingPrompt={enhancingPrompt}
          promptEnhanced={promptEnhanced}
          sendMessage={sendMessage}
          model={model}
          setModel={handleModelChange}
          provider={provider}
          setProvider={handleProviderChange}
          providerList={activeProviders}
          messageRef={messageRef}
          scrollRef={scrollRef}
          handleInputChange={(e) => {
            onTextareaChange(e);
            debouncedCachePrompt(e);
          }}
          handleStop={abort}
          description={description}
          importChat={importChat}
          exportChat={exportChat}
          messages={messages.map((message, i) => {
            if (message.role === 'user') {
              return message;
            }

            return {
              ...message,
              content: parsedMessages[i] || '',
            };
          })}
          enhancePrompt={() => {
            enhancePrompt(
              input,
              (input) => {
                setInput(input);
                scrollTextArea();
              },
              model,
              provider,
              apiKeys,
            );
          }}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          imageDataList={imageDataList}
          setImageDataList={setImageDataList}
          actionAlert={actionAlert}
          clearAlert={() => workbenchStore.clearAlert()}
          requestStatus={A2_ENABLE_RESPONSE_STATS ? requestStatus : undefined}
          requestStartedAt={requestStartedAtRef.current}
          streamingContentLength={streamingContentLength}
          agentModeAvailable={multiAgentAvailable}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
          agentModeDisabled={orchestrationActive}
          multiAgentPanel={multiAgentPanel}
        />
        {/* add-generation-telemetry (task 6.1): dev-only waterfall panel, flag-gated */}
        {A2_ENABLE_GENERATION_TELEMETRY && <GenerationTelemetryPanel persistedAnnotations={persistedTelemetry} />}
      </>
    );
  },
);
