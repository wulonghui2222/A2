import type { Message } from 'ai';
import type { ChatHistoryItem } from '~/lib/persistence/useChatHistory';
import { createScopedLogger } from '~/utils/logger';

// A2 (design D4, task 3.3): server-backed drop-in replacement for bolt's
// IndexedDB persistence (`lib/persistence/db.ts`). Same function signatures,
// same resolve/reject semantics, so `useChatHistory` and all nanostores call
// sites stay untouched. Storage moves from IndexedDB to the /api/projects
// resource routes (session cookie travels with same-origin fetch).
//
// Mapping notes (see docs/a2-persistence-notes.md):
// - id allocation (`getNextId`) becomes POST /api/projects (server cuid)
// - `setMessages` is an idempotent whole-record PUT (bolt does full `put`s
//   on a 50ms throttle while streaming; the route mirrors that)
// - timestamps are owned by the server (`updatedAt`), client values ignored

const logger = createScopedLogger('A2ChatHistory');

/** Opaque handle standing in for IDBDatabase; kept for signature parity. */
export interface A2DbHandle {
  kind: 'a2-server';
}

interface ProjectSummary {
  id: string;
  urlId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectDetail extends ProjectSummary {
  messages: Message[];
  timestamp: string;
}

// Same-origin resource routes; the session cookie is sent automatically.
const API = '/api/projects';

export async function openDatabase(): Promise<A2DbHandle | undefined> {
  if (typeof window === 'undefined') {
    // SSR: persistence calls only ever run in the browser bundle.
    return undefined;
  }

  return { kind: 'a2-server' };
}

async function apiRequest(method: string, path: string, body?: unknown): Promise<Response> {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    throw new Error('Session expired, please log in again');
  }

  return response;
}

export async function getAll(_db: A2DbHandle): Promise<ChatHistoryItem[]> {
  const response = await apiRequest('GET', API);

  if (!response.ok) {
    throw new Error(`Failed to load chat list (${response.status})`);
  }

  const projects: ProjectSummary[] = await response.json();

  // The list endpoint omits messages; sidebar/date-binning only needs the
  // metadata fields, so an empty array keeps the ChatHistoryItem shape.
  return projects.map((project) => ({
    id: project.id,
    urlId: project.urlId,
    description: project.description ?? undefined,
    messages: [],
    timestamp: project.updatedAt,
  }));
}

async function fetchDetail(mixedId: string): Promise<ChatHistoryItem | undefined> {
  const response = await apiRequest('GET', `${API}/${encodeURIComponent(mixedId)}`);

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Failed to load chat (${response.status})`);
  }

  const detail: ProjectDetail = await response.json();

  return {
    id: detail.id,
    urlId: detail.urlId,
    description: detail.description ?? undefined,
    messages: detail.messages,
    timestamp: detail.timestamp,
  };
}

export async function getMessages(_db: A2DbHandle, id: string): Promise<ChatHistoryItem> {
  // The route resolves id and urlId alike (bolt: try id first, then urlId).
  return (await fetchDetail(id)) as ChatHistoryItem;
}

export async function getMessagesById(db: A2DbHandle, id: string): Promise<ChatHistoryItem> {
  return getMessages(db, id);
}

export async function getMessagesByUrlId(db: A2DbHandle, id: string): Promise<ChatHistoryItem> {
  return getMessages(db, id);
}

export async function setMessages(
  _db: A2DbHandle,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
  timestamp?: string,
): Promise<void> {
  if (timestamp && isNaN(Date.parse(timestamp))) {
    throw new Error('Invalid timestamp');
  }

  const response = await apiRequest('PUT', `${API}/${encodeURIComponent(id)}`, {
    messages,
    ...(urlId ? { urlId } : {}),
    ...(description ? { description } : {}),
  });

  if (response.status === 404) {
    throw new Error('Chat not found');
  }

  if (!response.ok) {
    throw new Error(`Failed to save chat (${response.status})`);
  }
}

export async function deleteById(_db: A2DbHandle, id: string): Promise<void> {
  const response = await apiRequest('DELETE', `${API}/${encodeURIComponent(id)}`);

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete chat (${response.status})`);
  }
}

/** bolt allocates numeric ids client-side; the server allocates on POST. */
export async function getNextId(_db: A2DbHandle): Promise<string> {
  const response = await apiRequest('POST', API, {});

  if (!response.ok) {
    throw new Error(`Failed to create chat (${response.status})`);
  }

  const project: ProjectSummary = await response.json();

  return project.id;
}

export async function getUrlId(db: A2DbHandle, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  }

  let i = 2;

  while (idList.includes(`${id}-${i}`)) {
    i++;
  }

  return `${id}-${i}`;
}

async function getUrlIds(db: A2DbHandle): Promise<string[]> {
  const chats = await getAll(db);

  return chats.map((chat) => chat.urlId).filter(Boolean) as string[];
}

export async function forkChat(db: A2DbHandle, chatId: string, messageId: string): Promise<string> {
  const chat = await getMessages(db, chatId);

  if (!chat) {
    throw new Error('Chat not found');
  }

  const messageIndex = chat.messages.findIndex((msg) => msg.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const messages = chat.messages.slice(0, messageIndex + 1);

  return createChatFromMessages(db, chat.description ? `${chat.description} (fork)` : 'Forked chat', messages);
}

export async function duplicateChat(db: A2DbHandle, id: string): Promise<string> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  return createChatFromMessages(db, `${chat.description || 'Chat'} (copy)`, chat.messages);
}

export async function createChatFromMessages(
  db: A2DbHandle,
  description: string,
  messages: Message[],
): Promise<string> {
  const response = await apiRequest('POST', API, { description });

  if (!response.ok) {
    throw new Error(`Failed to create chat (${response.status})`);
  }

  const project: ProjectSummary = await response.json();

  await setMessages(db, project.id, messages, undefined, description);

  // Navigation target, same as bolt (returns the urlId, not the id).
  return project.urlId;
}

export async function updateChatDescription(db: A2DbHandle, id: string, description: string): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  if (!description.trim()) {
    throw new Error('Description cannot be empty');
  }

  await setMessages(db, id, chat.messages, chat.urlId, description, chat.timestamp);
}

// Re-exported so `~/lib/persistence` consumers keep a stable import surface.
export type { ChatHistoryItem };
export { logger };
