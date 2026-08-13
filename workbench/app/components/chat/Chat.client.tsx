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
import { showWorkbench } from '~/lib/stores/workbench-ui-state';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { A2_ENABLE_GENERATION_TELEMETRY, A2_ENABLE_PROVIDER_SWITCH, A2_ENABLE_RESPONSE_STATS } from '~/a2/config';
import { generationTelemetry, type TelemetryAnnotationValue } from '~/a2/telemetry';
import { GenerationTelemetryPanel } from '~/a2/generation-telemetry-panel';
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

const processSampledMessagesIdle = createSampler(
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

const processSampledMessagesStreaming = createSampler(
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
  250,
);

const processSampledMessages = (options: {
  messages: Message[];
  initialMessages: Message[];
  isLoading: boolean;
  parseMessages: (messages: Message[], isLoading: boolean) => void;
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}) => {
  if (options.isLoading) {
    processSampledMessagesStreaming(options);
  } else {
    processSampledMessagesIdle(options);
  }
};

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
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
        showWorkbench.set(true);
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
       *
       * A2 FIX: wrap in a timeout safety net so that if framer-motion's
       * animate() never resolves, chatStarted is still set to true.
       */
      const animations = [
        animate('#intro', { opacity: 0 }, { duration: 0.2, ease: cubicEasingFn }),
      ];

      if (document.querySelector('#examples')) {
        animations.unshift(animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }));
      }

      await Promise.race([
        Promise.all(animations).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);

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

      // Auto-open the workbench panel when the user submits a prompt.
      showWorkbench.set(true);

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
        />
        {/* add-generation-telemetry (task 6.1): dev-only waterfall panel, flag-gated */}
        {A2_ENABLE_GENERATION_TELEMETRY && <GenerationTelemetryPanel persistedAnnotations={persistedTelemetry} />}
      </>
    );
  },
);
