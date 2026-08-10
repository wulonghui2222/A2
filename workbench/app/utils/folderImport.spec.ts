import { describe, expect, it } from 'vitest';
import { createChatFromFolder } from './folderImport';

/*
 * Node env lacks FileReader; stub it to echo the file's stored text. The
 * production code only relies on onload/readAsText semantics.
 */
class FileReaderStub {
  result: string | undefined;
  onload: (() => void) | undefined;
  onerror: ((err: unknown) => void) | undefined;

  readAsText(file: { __content: string }) {
    queueMicrotask(() => {
      this.result = file.__content;
      this.onload?.();
    });
  }
}

(globalThis as any).FileReader = FileReaderStub;

const makeFile = (path: string, content: string) =>
  ({ webkitRelativePath: path, __content: content }) as unknown as File;

describe('createChatFromFolder', () => {
  it('produces a user request, an assistant artifact message and a setup message', async () => {
    const files = [
      makeFile('my-app/package.json', JSON.stringify({ scripts: { dev: 'vite' } })),
      makeFile('my-app/src/index.js', 'console.log(1)'),
    ];

    const messages = await createChatFromFolder(files, [], 'my-app');

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Import the "my-app" folder');

    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toContain('<boltArtifact id="imported-files"');
    expect(messages[1].content).toContain('filePath="src/index.js"');
    expect(messages[1].content).toContain('console.log(1)');

    // package.json with a dev script triggers the setup commands message.
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toContain('npm install && npm run dev');
  });

  it('lists skipped binary files and omits the setup message when no commands exist', async () => {
    const files = [makeFile('site/index.html', '<h1>hi</h1>')];

    const withBinaries = await createChatFromFolder(files, ['site/logo.png'], 'site');
    const withoutBinaries = await createChatFromFolder([makeFile('other/readme.md', '# hi')], [], 'other');

    // index.html maps to the static serve command -> still 3 messages.
    expect(withBinaries[1].content).toContain('Skipped 1 binary files');
    expect(withBinaries[1].content).toContain('- site/logo.png');

    // No package.json / index.html -> no commands message at all.
    expect(withoutBinaries).toHaveLength(2);
    expect(withoutBinaries[1].content).not.toContain('Skipped');
  });
});
