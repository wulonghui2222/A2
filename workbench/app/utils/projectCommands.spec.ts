import { describe, expect, it } from 'vitest';
import { createCommandsMessage, detectProjectCommands } from './projectCommands';

describe('detectProjectCommands', () => {
  it('prefers the dev script from package.json', async () => {
    const commands = await detectProjectCommands([
      {
        path: 'app/package.json',
        content: JSON.stringify({ scripts: { dev: 'vite', start: 'node .', preview: 'vite preview' } }),
      },
    ]);

    expect(commands.type).toBe('Node.js');
    expect(commands.setupCommand).toBe('npm install && npm run dev');
    expect(commands.followupMessage).toContain('"dev"');
  });

  it('falls back to start, then preview, in priority order', async () => {
    const withStart = await detectProjectCommands([
      { path: 'package.json', content: JSON.stringify({ scripts: { start: 'node .', preview: 'x' } }) },
    ]);
    const withPreview = await detectProjectCommands([
      { path: 'package.json', content: JSON.stringify({ scripts: { preview: 'x' } }) },
    ]);

    expect(withStart.setupCommand).toBe('npm install && npm run start');
    expect(withPreview.setupCommand).toBe('npm install && npm run preview');
  });

  it('falls back to plain npm install when no runnable script exists', async () => {
    const commands = await detectProjectCommands([
      { path: 'package.json', content: JSON.stringify({ scripts: {} }) },
    ]);

    expect(commands.setupCommand).toBe('npm install');
    expect(commands.followupMessage).toContain('inspect package.json');
  });

  it('returns empty commands for a malformed package.json', async () => {
    const commands = await detectProjectCommands([{ path: 'package.json', content: '{oops' }]);

    expect(commands).toEqual({ type: '', setupCommand: '', followupMessage: '' });
  });

  it('detects static sites via index.html', async () => {
    const commands = await detectProjectCommands([{ path: 'site/index.html', content: '<h1/>' }]);

    expect(commands.type).toBe('Static');
    expect(commands.setupCommand).toBe('npx --yes serve');
  });

  it('returns empty commands for unrecognized folders', async () => {
    const commands = await detectProjectCommands([{ path: 'notes/todo.md', content: '- x' }]);

    expect(commands).toEqual({ type: '', setupCommand: '', followupMessage: '' });
  });
});

describe('createCommandsMessage', () => {
  it('returns null when there is no setup command', () => {
    expect(createCommandsMessage({ type: '', setupCommand: '', followupMessage: '' })).toBeNull();
  });

  it('wraps the setup command in a shell action artifact', () => {
    const message = createCommandsMessage({
      type: 'Node.js',
      setupCommand: 'npm install',
      followupMessage: 'done',
    });

    expect(message).not.toBeNull();
    expect(message!.role).toBe('assistant');
    expect(message!.content).toContain('<boltAction type="shell">');
    expect(message!.content).toContain('npm install');
    expect(message!.content).toContain('done');
  });

  it('omits the followup text when empty', () => {
    const message = createCommandsMessage({ type: 'Static', setupCommand: 'npx --yes serve', followupMessage: '' });

    expect(message!.content).not.toContain('</boltArtifact>\n\n');
  });
});
