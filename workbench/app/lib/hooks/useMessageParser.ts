import type { Message } from 'ai';
import { useCallback, useState } from 'react';
import { generationTelemetry } from '~/a2/telemetry';
import { StreamingMessageParser } from '~/lib/runtime/message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

const messageParser = new StreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      logger.trace('onArtifactOpen', data);

      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      logger.trace('onArtifactClose');

      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data) => {
      logger.trace('onActionOpen', data.action);

      // we only add shell actions when when the close tag got parsed because only then we have the content
      if (data.action.type === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      logger.trace('onActionClose', data.action);

      if (data.action.type !== 'file') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    },
    onActionStream: (data) => {
      logger.trace('onActionStream', data.action);
      workbenchStore.runAction(data, true);
    },
  },
});

/*
 * add-generation-telemetry (task 4.1): flush parsing to the final content and
 * expose the parser's open state so stream end can detect unclosed artifacts.
 * Parsing is incremental/position-based, so re-parsing the same content is a no-op.
 */
export function flushMessageParse(
  messageId: string,
  content: string,
): { insideArtifact: boolean; insideAction: boolean } {
  messageParser.parse(messageId, content);
  return messageParser.getOpenState(messageId);
}

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    // add-generation-telemetry (task 2.2): live streaming is fresh, reload re-parse is replay
    generationTelemetry.setRoundSource(isLoading ? 'fresh' : 'replay');

    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
    }

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant') {
        const newParsedContent = messageParser.parse(message.id, message.content);

        // add-generation-telemetry: a replayed message is fully parsed here; finalization waits for its action queue to drain
        if (!isLoading) {
          void generationTelemetry.streamEnd(message.id);
        }

        setParsedMessages((prevParsed) => ({
          ...prevParsed,
          [index]: !reset ? (prevParsed[index] || '') + newParsedContent : newParsedContent,
        }));
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
