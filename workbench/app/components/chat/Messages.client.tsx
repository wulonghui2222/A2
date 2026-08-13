import type { Message } from 'ai';
import React, { Fragment, useState, useMemo } from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { ResponseStats, type RequestStatus } from './ResponseStats';
import { UserMessage } from './UserMessage';
import { useLocation } from '@remix-run/react';
import { db, chatId } from '~/lib/persistence/useChatHistory';
import { forkChat } from '~/lib/persistence/db';
import { isPlanAnnotation } from '~/a2/multi-agent/plan-model';
import { toast } from 'react-toastify';
import WithTooltip from '~/components/ui/Tooltip';

const INITIAL_VISIBLE_COUNT = 20;

/*
 * add-multi-agent-team: per-card agent attribution, derived from persisted
 * markers so reloaded chats keep their badges. PD = plan annotation, TL =
 * tl-wrapup annotation, Engineer = assistant round following a hidden
 * per-step instruction.
 */
function agentLabelFor(messages: Message[], index: number): string | undefined {
  const annotations = (messages[index].annotations ?? []) as unknown[];

  if (annotations.some((annotation) => (annotation as { type?: string })?.type === 'tl-wrapup')) {
    return 'TL';
  }

  if (annotations.some(isPlanAnnotation)) {
    return 'PD';
  }

  const previous = messages[index - 1];

  if (previous?.role === 'user' && ((previous.annotations ?? []) as unknown[]).includes('hidden')) {
    /*
     * runStepRound appends the hidden instruction with array (parts)
     * content, so live messages carry an array while reloaded ones carry
     * a string — normalize before matching.
     */
    const previousText =
      typeof previous.content === 'string'
        ? previous.content
        : ((previous.content as { text?: string }[]) ?? []).map((part) => part?.text ?? '').join('\n');
    const match = /当前执行步骤 (\d+)/.exec(previousText);

    if (match) {
      return `工程师 · 步骤 ${match[1]}`;
    }
  }

  return undefined;
}

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];

  // chat-response-stats (design D2/D3): live request phase feedback.
  requestStatus?: RequestStatus;
  requestStartedAt?: number;
  streamingContentLength?: number;
}

export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const {
    id,
    isStreaming = false,
    messages = [],
    requestStatus = 'idle',
    requestStartedAt,
    streamingContentLength,
  } = props;
  const location = useLocation();

  const [showAll, setShowAll] = useState(false);

  const visibleMessages = useMemo(() => {
    if (showAll || messages.length <= INITIAL_VISIBLE_COUNT) {
      return messages;
    }
    return messages.slice(messages.length - INITIAL_VISIBLE_COUNT);
  }, [messages, showAll]);

  const hiddenCount = messages.length - visibleMessages.length;

  const handleRewind = (messageId: string) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('rewindTo', messageId);
    window.location.search = searchParams.toString();
  };

  const handleFork = async (messageId: string) => {
    try {
      if (!db || !chatId.get()) {
        toast.error('Chat persistence is not available');
        return;
      }

      const urlId = await forkChat(db, chatId.get()!, messageId);
      window.location.href = `/chat/${urlId}`;
    } catch (error) {
      toast.error('Failed to fork chat: ' + (error as Error).message);
    }
  };

  return (
    <div id={id} ref={ref} className={props.className}>
      {hiddenCount > 0 && (
        <div className="flex justify-center py-3">
          <button
            onClick={() => setShowAll(true)}
            className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-4 py-2 rounded-md border border-bolt-elements-borderColor hover:border-bolt-elements-borderColor-active transition-colors"
          >
            加载更早的 {hiddenCount} 条消息
          </button>
        </div>
      )}
      {visibleMessages.length > 0
        ? visibleMessages.map((message) => {
            const actualIndex = messages.indexOf(message);
            const { role, content, id: messageId, annotations } = message;
            const isUserMessage = role === 'user';
            const isFirst = actualIndex === 0;
            const isLast = actualIndex === messages.length - 1;
            const isHidden = annotations?.includes('hidden');

            if (isHidden) {
              return <Fragment key={actualIndex} />;
            }

            return (
              <div
                key={actualIndex}
                className={classNames('flex gap-4 p-6 w-full rounded-[calc(0.75rem-1px)]', {
                  'bg-bolt-elements-messages-background': isUserMessage || !isStreaming || (isStreaming && !isLast),
                  'bg-gradient-to-b from-bolt-elements-messages-background from-30% to-transparent':
                    isStreaming && isLast,
                  'mt-4': !isFirst,
                })}
              >
                {isUserMessage && (
                  <div className="flex items-center justify-center w-[34px] h-[34px] overflow-hidden bg-white text-gray-600 rounded-full shrink-0 self-start">
                    <div className="i-ph:user-fill text-xl"></div>
                  </div>
                )}
                <div className="grid grid-col-1 w-full">
                  {isUserMessage ? (
                    <UserMessage content={content} />
                  ) : (
                    <AssistantMessage
                      content={content}
                      annotations={message.annotations}
                      agentLabel={agentLabelFor(messages, actualIndex)}
                      /*
                       * dashscope-reasoning-stream (task 7.4): the reasoning
                       * panel auto-expands only on the live assistant message.
                       */
                      isLiveMessage={isLast && (requestStatus === 'thinking' || requestStatus === 'streaming')}
                      isStreaming={isLast && isStreaming}
                    />
                  )}
                </div>
                {!isUserMessage && (
                  <div className="flex gap-2 flex-col lg:flex-row">
                    {messageId && (
                      <WithTooltip tooltip="Revert to this message">
                        <button
                          onClick={() => handleRewind(messageId)}
                          key="i-ph:arrow-u-up-left"
                          className={classNames(
                            'i-ph:arrow-u-up-left',
                            'text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors',
                          )}
                        />
                      </WithTooltip>
                    )}

                    <WithTooltip tooltip="Fork chat from this message">
                      <button
                        onClick={() => handleFork(messageId)}
                        key="i-ph:git-fork"
                        className={classNames(
                          'i-ph:git-fork',
                          'text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors',
                        )}
                      />
                    </WithTooltip>
                  </div>
                )}
              </div>
            );
          })
        : null}
      {requestStatus === 'waiting' || requestStatus === 'thinking' || requestStatus === 'streaming' ? (
        /*
         * dashscope-reasoning-stream: spinner and live status share one
         * centered line instead of stacking vertically.
         */
        <div
          className={classNames(
            'flex items-center justify-center gap-3 w-full',
            /*
             * While thinking the card ends at the reasoning panel, so the
             * default mt-4 plus the card padding reads as a big empty gap;
             * pull the live status line up under the card.
             */
            requestStatus === 'thinking' ? 'mt-0' : 'mt-4',
          )}
        >
          <div className="text-bolt-elements-textSecondary i-svg-spinners:3-dots-fade text-2xl"></div>
          <ResponseStats status={requestStatus} startedAt={requestStartedAt} contentLength={streamingContentLength} />
        </div>
      ) : (
        isStreaming && (
          <div className="text-center w-full text-bolt-elements-textSecondary i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
        )
      )}
    </div>
  );
});
