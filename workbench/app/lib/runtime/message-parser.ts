import type { ActionType, BoltAction, BoltActionData, FileAction, ShellAction } from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

// Some models emit whitespace between '<' and the tag name (e.g. '< boltArtifact',
// '< /boltAction>'), so tag matching tolerates optional whitespace. Without this the
// tags would be rendered as raw text in the chat and no actions would run.
const ARTIFACT_TAG_NAME = 'boltArtifact';
const ACTION_TAG_OPEN_REGEX = /<\s*boltAction/g;
const ACTION_TAG_CLOSE_REGEX = /<\s*\/\s*boltAction\s*>/g;
const ARTIFACT_TAG_CLOSE_REGEX = /<\s*\/\s*boltArtifact\s*>/g;

interface TagMatch {
  index: number;
  length: number;
}

/** indexOf-like search that allows whitespace inside the tag markup. */
function findTag(input: string, regex: RegExp, from: number): TagMatch | undefined {
  regex.lastIndex = from;

  const match = regex.exec(input);

  return match ? { index: match.index, length: match[0].length } : undefined;
}

const logger = createScopedLogger('MessageParser');

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionStream?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
}

function cleanoutMarkdownSyntax(content: string) {
  const codeBlockRegex = /^\s*```\w*\n([\s\S]*?)\n\s*```\s*$/;
  const match = content.match(codeBlockRegex);

  // console.log('matching', !!match, content);

  if (match) {
    return match[1]; // Remove common leading 4-space indent
  } else {
    return content;
  }
}
export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  parse(messageId: string, input: string) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: '' },
        actionId: 0,
      };

      this.#messages.set(messageId, state);
    }

    let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeMatch = findTag(input, ACTION_TAG_CLOSE_REGEX, i);

          const currentAction = state.currentAction;

          if (closeMatch) {
            currentAction.content += input.slice(i, closeMatch.index);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              // Remove markdown code block syntax if present and file is not markdown
              if (!currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
              }

              content += '\n';
            }

            currentAction.content = content;

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,

              /**
               * We decrement the id because it's been incremented already
               * when `onActionOpen` was emitted to make sure the ids are
               * the same.
               */
              actionId: String(state.actionId - 1),

              action: currentAction as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '' };

            i = closeMatch.index + closeMatch.length;
          } else {
            if ('type' in currentAction && currentAction.type === 'file') {
              let content = input.slice(i);

              if (!currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
              }

              this._options.callbacks?.onActionStream?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: {
                  ...(currentAction as FileAction),
                  content,
                  filePath: currentAction.filePath,
                },
              });
            }

            break;
          }
        } else {
          const actionOpenMatch = findTag(input, ACTION_TAG_OPEN_REGEX, i);
          const artifactCloseMatch = findTag(input, ARTIFACT_TAG_CLOSE_REGEX, i);

          if (actionOpenMatch && (!artifactCloseMatch || actionOpenMatch.index < artifactCloseMatch.index)) {
            const actionEndIndex = input.indexOf('>', actionOpenMatch.index);

            if (actionEndIndex !== -1) {
              state.insideAction = true;

              state.currentAction = this.#parseActionTag(input, actionOpenMatch.index, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseMatch) {
            this._options.callbacks?.onArtifactClose?.({ messageId, ...currentArtifact });

            state.insideArtifact = false;
            state.currentArtifact = undefined;

            i = artifactCloseMatch.index + artifactCloseMatch.length;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        // Skip any whitespace between '<' and the tag name ('< boltArtifact').
        let k = i + 1;

        while (k < input.length && /\s/.test(input[k])) {
          k++;
        }

        let nameLen = 0;

        while (
          nameLen < ARTIFACT_TAG_NAME.length &&
          k + nameLen < input.length &&
          input[k + nameLen] === ARTIFACT_TAG_NAME[nameLen]
        ) {
          nameLen++;
        }

        if (nameLen === ARTIFACT_TAG_NAME.length) {
          const nextChar = input[k + nameLen];

          if (nextChar && nextChar !== '>' && nextChar !== ' ') {
            output += input.slice(i, k + nameLen);
            i = k + nameLen;
          } else {
            const openTagEnd = input.indexOf('>', k + nameLen);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const type = this.#extractAttribute(artifactTag, 'type') as string;
              const artifactId = this.#extractAttribute(artifactTag, 'id') as string;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              if (!artifactId) {
                logger.warn('Artifact id missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
                type,
              } satisfies BoltArtifactData;

              state.currentArtifact = currentArtifact;

              this._options.callbacks?.onArtifactOpen?.({ messageId, ...currentArtifact });

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;

              output += artifactFactory({ messageId });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }
          }
        } else if (k + nameLen === input.length) {
          // Incomplete tag at the end of the stream: wait for more chunks.
          earlyBreak = true;
        } else {
          output += input.slice(i, k + nameLen);
          i = k + nameLen;
        }

        if (earlyBreak) {
          break;
        }
      } else {
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;

    return output;
  }

  /**
   * add-generation-telemetry (task 4.1): read-only probe for unclosed-artifact
   * detection at stream end. Does not alter parsing behavior.
   */
  getOpenState(messageId: string): { insideArtifact: boolean; insideAction: boolean } {
    const state = this.#messages.get(messageId);

    return {
      insideArtifact: state?.insideArtifact ?? false,
      insideAction: state?.insideAction ?? false,
    };
  }

  reset() {
    this.#messages.clear();
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'file') {
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('File path not specified');
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (!['shell', 'start'].includes(actionType)) {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    const match = tag.match(new RegExp(`${attributeName}="([^"]*)"`, 'i'));
    return match ? match[1] : undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
