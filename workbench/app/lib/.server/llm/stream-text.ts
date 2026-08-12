import { convertToCoreMessages, streamText as _streamText } from 'ai';
import { MAX_TOKENS } from './constants';
import { dashScopeStreamText, isDashScopeDefault } from './dashscope-stream';
import { A2_ENABLE_BYOK } from '~/a2/config';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  MODEL_REGEX,
  MODIFICATIONS_TAG_NAME,
  PROVIDER_LIST,
  PROVIDER_REGEX,
  WORK_DIR,
} from '~/utils/constants';
import ignore from 'ignore';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';

interface ToolResult<Name extends string, Args, Result> {
  toolCallId: string;
  toolName: Name;
  args: Args;
  result: Result;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolResult<string, unknown, unknown>[];
  model?: string;
}

export type Messages = Message[];

export type StreamingOptions = Omit<Parameters<typeof _streamText>[0], 'model'>;

/*
 * dashscope-reasoning-stream (task 4.2): union return shape. api.chat.ts only
 * consumes toDataStream(), which both paths provide; the dashscope variant
 * emits the wire format directly (design D2).
 */
export interface StreamTextCallResult {
  toDataStream: (options?: { getErrorMessage?: (error: unknown) => string }) => ReadableStream<Uint8Array>;

  /** Plain answer text for the non-chat routes (api.enhancer / api.llmcall). */
  textStream: ReadableStream<string>;
}

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export function simplifyBoltActions(input: string): string {
  // Using regex to match boltAction tags that have type="file"
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

// Common patterns to ignore, similar to .gitignore
const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
  '**/*lock.json',
  '**/*lock.yml',
];
const ig = ignore().add(IGNORE_PATTERNS);

function createFilesContext(files: FileMap) {
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      return `<file path="${path}">\n${codeWithLinesNumbers}\n</file>`;
    });

  return `Below are the code files present in the webcontainer:\ncode format:\n<line number>|<line content>\n <codebase>${fileContexts.join('\n\n')}\n\n</codebase>`;
}

function extractPropertiesFromMessage(message: Message): { model: string; provider: string; content: string } {
  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : message.content;

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = Array.isArray(message.content)
    ? message.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text?.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, ''),
          };
        }

        return item; // Preserve image_url and other types as is
      })
    : textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

const logger = createScopedLogger('stream-text');

export async function streamText(props: {
  messages: Messages;
  env: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;

  /*
   * chat-response-stats (task 2.2): invoked once, when the first visible
   * content text-delta arrives (reasoning chunks are not text deltas).
   */
  onFirstTextDelta?: () => void;

  /*
   * dashscope-reasoning-stream (task 2.3/5.1): invoked once, when the first
   * reasoning_content delta is parsed from the upstream SSE.
   */
  onFirstReasoningToken?: () => void;
}): Promise<StreamTextCallResult> {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    onFirstTextDelta,
    onFirstReasoningToken,
  } = props;

  // console.log({serverEnv});

  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;

      if (contextOptimization) {
        content = simplifyBoltActions(content);
      }

      return { ...message, content };
    }

    return message;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails && modelDetails.maxTokenAllowed ? modelDetails.maxTokenAllowed : MAX_TOKENS;

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
    }) ?? getSystemPrompt();

  if (files && contextOptimization) {
    const codeContext = createFilesContext(files);
    systemPrompt = `${systemPrompt}\n\n ${codeContext}`;
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  /*
   * dashscope-reasoning-stream (task 4.1): the platform default model goes
   * through dashScopeStreamText, which parses the gateway SSE itself so
   * reasoning_content survives (design D1). BYOK paths keep _streamText.
   * Task 4.2: the wrapper exposes the same toDataStream() call site.
   */
  if (!A2_ENABLE_BYOK && isDashScopeDefault(provider.name, modelDetails.name)) {
    return dashScopeStreamText({
      model: modelDetails.name,
      system: systemPrompt,
      maxTokens: dynamicMaxTokens,
      messages: processedMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
      env: serverEnv,
      options: {
        onFinish: options?.onFinish as
          | ((event: { text: string; finishReason: string; usage?: any }) => void | Promise<void>)
          | undefined,
      },
      onFirstTextDelta,
      onFirstReasoningToken,
    });
  }

  let firstTextDeltaReported = false;

  return _streamText({
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: systemPrompt,
    maxTokens: dynamicMaxTokens,
    messages: convertToCoreMessages(processedMessages as any),
    ...options,
    onChunk: async (event) => {
      if (!firstTextDeltaReported && event.chunk.type === 'text-delta' && onFirstTextDelta) {
        firstTextDeltaReported = true;
        onFirstTextDelta();
      }

      await options?.onChunk?.(event);
    },
  });
}
