import type { Page } from '@playwright/test';
import { dataStreamBody } from './llm-stream';

/*
 * replay-snapshot-cache (task 5.1): stubbed LLM stream for a minimal
 * vite + react artifact that exercises the real install/start path, so the
 * snapshot write-back trigger (install complete + preview opened) fires.
 * Selection still picks `blank` to keep the suite free of GitHub imports.
 */

export const NM_ARTIFACT_ID = 'nm-cache-e2e';
export const NM_ARTIFACT_TITLE = 'NM 缓存演示项目';
export const NM_INTRO_TEXT = '好的，我来创建一个最小的 Vite + React 应用。';

const NM_PACKAGE_JSON = [
  '{',
  '  "name": "nm-cache-e2e",',
  '  "private": true,',
  '  "type": "module",',
  '  "scripts": { "dev": "vite" },',
  '  "dependencies": {',
  '    "react": "^18.3.1",',
  '    "react-dom": "^18.3.1"',
  '  },',
  '  "devDependencies": {',
  '    "vite": "^5.4.8",',
  '    "@vitejs/plugin-react": "^4.3.2"',
  '  }',
  '}',
].join('\n');

const NM_VITE_CONFIG = [
  "import { defineConfig } from 'vite';",
  "import react from '@vitejs/plugin-react';",
  '',
  'export default defineConfig({ plugins: [react()] });',
].join('\n');

const NM_INDEX_HTML = [
  '<!doctype html>',
  '<html>',
  '  <head><title>NM Cache E2E</title></head>',
  '  <body>',
  '    <div id="root"></div>',
  '    <script type="module" src="/src/main.jsx"></script>',
  '  </body>',
  '</html>',
].join('\n');

const NM_MAIN_JSX = [
  "import React from 'react';",
  "import { createRoot } from 'react-dom/client';",
  '',
  'createRoot(document.getElementById("root")).render(<h1>NM Cache E2E</h1>);',
].join('\n');

function fileAction(filePath: string, content: string): string[] {
  return [`<boltAction type="file" filePath="${filePath}">`, content, '</boltAction>'];
}

/** Bootstrap artifact: files + npm install + npm run dev. */
export function nmStubAssistantMessage(): string {
  return [
    NM_INTRO_TEXT,
    '',
    `<boltArtifact id="${NM_ARTIFACT_ID}" title="${NM_ARTIFACT_TITLE}">`,
    ...fileAction('package.json', NM_PACKAGE_JSON),
    ...fileAction('vite.config.js', NM_VITE_CONFIG),
    ...fileAction('index.html', NM_INDEX_HTML),
    ...fileAction('src/main.jsx', NM_MAIN_JSX),
    '<boltAction type="shell">npm install</boltAction>',
    '<boltAction type="start">npm run dev</boltAction>',
    '</boltArtifact>',
  ].join('\n');
}

/** Same stub routes as mountLlmStub, but the chat stream carries the NM artifact. */
export async function mountNmStub(page: Page): Promise<void> {
  await page.route('**/api/llmcall', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `<selection><templateName>blank</templateName><title>${NM_ARTIFACT_TITLE}</title></selection>`,
      }),
    }),
  );

  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: dataStreamBody(nmStubAssistantMessage()),
    }),
  );

  await page.route('**/api/llm/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data: [] }),
    }),
  );
}
