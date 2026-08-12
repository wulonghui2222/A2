import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { restoreWorkspaceSnapshot } from '~/lib/runtime/snapshot-cache';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getMessages,
  getNextId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
} from './db';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  fileSnapshot?: string;
  timestamp: string;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

export const db = persistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  useEffect(() => {
    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      getMessages(db, mixedId)
        .then(async (storedMessages) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            const rewindId = searchParams.get('rewindTo');
            const filteredMessages = rewindId
              ? storedMessages.messages.slice(0, storedMessages.messages.findIndex((m) => m.id === rewindId) + 1)
              : storedMessages.messages;

            /*
             * restore-workbench-snapshot (D2): write the persisted file tree
             * back into WebContainer so the Files panel is populated before
             * the Chat component renders.
             */
            let persistedFiles: Record<string, string> | undefined;

            if (storedMessages.fileSnapshot) {
              try {
                const snapshot = JSON.parse(storedMessages.fileSnapshot);

                if (snapshot && typeof snapshot === 'object' && Object.keys(snapshot).length > 0) {
                  persistedFiles = snapshot;
                  await workbenchStore.restoreFiles(snapshot);
                }
              } catch (err) {
                console.warn('Failed to restore file snapshot', err);
              }
            }

            /*
             * replay-snapshot-cache (design D5 steps 1-4): mount the cached
             * installed workspace (keyed by package.json) so replay can skip
             * npm install. Misses and failures fall back to the full replay
             * transparently. Must finish before the Chat component parses
             * messages and re-queues the action queue.
             */
            const bootstrapMessageId = filteredMessages.find((message) => message.role === 'assistant')?.id;

            if (bootstrapMessageId) {
              try {
                const restoreResult = await restoreWorkspaceSnapshot(
                  persistedFiles?.['package.json'],
                  bootstrapMessageId,
                );

                if (restoreResult.restored) {
                  workbenchStore.setSnapshotRestored(bootstrapMessageId);
                }
              } catch (err) {
                console.warn('Snapshot restore failed, falling back to full replay', err);
              }
            }

            setInitialMessages(filteredMessages);
            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
          } else {
            navigate('/', { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          logStore.logError('Failed to load chat messages', error);
          toast.error(error.message);
        });
    }
  }, []);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: Message[]) => {
      if (!db || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      if (initialMessages.length === 0 && !chatId.get()) {
        const next = await getNextId(db);

        chatId.set(next.id);
        setUrlId(next.urlId);
        navigateChat(next.urlId);
      }

      // urlId is server-generated and immutable; no need to pass it on PUT.
      await setMessages(db, chatId.get() as string, messages, description.get());
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[]) => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
