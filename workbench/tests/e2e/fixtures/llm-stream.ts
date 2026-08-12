import type { Page } from '@playwright/test';

/*
 * A2 test-suite (TS-03, D3): deterministic LLM stubs for the generation flow.
 *
 * The browser-side generation path hits:
 *   POST /api/llmcall  -> starter-template selection ({ text } JSON)
 *   POST /api/chat     -> assistant stream in the ai-SDK data-stream protocol
 * `/api/llm/**` is intercepted defensively (OpenAI-compatible gateway paths).
 *
 * The selection stub chooses `blank` so the flow never reaches GitHub for
 * starter templates, keeping the suite hermetic.
 */

export const STUB_ARTIFACT_ID = 'e2e-artifact';
export const STUB_ARTIFACT_TITLE = 'E2E 演示项目';
export const STUB_FILE_PATH = 'index.html';
export const STUB_INTRO_TEXT = '好的，我来为你创建一个最简单的页面。';
export const STUB_SELECTION_TITLE = STUB_ARTIFACT_TITLE;

const STUB_FILE_CONTENT = [
  '<!doctype html>',
  '<html>',
  '  <head><title>E2E</title></head>',
  '  <body><h1>Hello E2E</h1></body>',
  '</html>',
].join('\n');

/** The full assistant message: intro text plus a boltArtifact with one file action. */
export function stubAssistantMessage(): string {
  return [
    STUB_INTRO_TEXT,
    '',
    `<boltArtifact id="${STUB_ARTIFACT_ID}" title="${STUB_ARTIFACT_TITLE}">`,
    `<boltAction type="file" filePath="${STUB_FILE_PATH}">`,
    STUB_FILE_CONTENT,
    '</boltAction>',
    '</boltArtifact>',
  ].join('\n');
}

/*
 * ai-SDK v4 data-stream protocol: `0:` carries JSON-encoded text deltas,
 * `e:`/`d:` close the message with finish reason and usage. Chunks are kept
 * small to exercise the streaming render path.
 */
export function dataStreamBody(text: string): string {
  const chunkSize = 16;
  const lines: string[] = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    lines.push(`0:${JSON.stringify(text.slice(i, i + chunkSize))}`);
  }

  const usage = { promptTokens: 12, completionTokens: 34 };

  lines.push(`e:${JSON.stringify({ finishReason: 'stop', usage, isContinued: false })}`);
  lines.push(`d:${JSON.stringify({ finishReason: 'stop', usage })}`);

  return `${lines.join('\n')}\n`;
}

/**
 * Mounts all LLM stubs on the page. Call before submitting the prompt:
 * every network hop of the generation flow is answered locally.
 */
export async function mountLlmStub(page: Page): Promise<void> {
  // Starter-template selection: pick blank to skip GitHub template imports.
  await page.route('**/api/llmcall', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `<selection><templateName>blank</templateName><title>${STUB_SELECTION_TITLE}</title></selection>`,
      }),
    }),
  );

  // Main generation stream consumed by useChat (ai/react).
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: dataStreamBody(stubAssistantMessage()),
    }),
  );

  // Defensive: OpenAI-compatible gateway paths (model list etc.).
  await page.route('**/api/llm/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data: [] }),
    }),
  );
}
