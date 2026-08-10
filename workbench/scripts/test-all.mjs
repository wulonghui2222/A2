/*
 * A2 test-suite (TS-04, D6): run vitest then Playwright sequentially.
 * A node script instead of shell `&&` so Windows PowerShell and Unix behave
 * identically. Exits with the first failing stage's exit code.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const stages = [
  ['unit', ['test']],
  ['e2e', ['exec', 'playwright', 'test']],
];

for (const [name, args] of stages) {
  console.log(`\n> test-all: ${name} (pnpm ${args.join(' ')})\n`);

  const code = await new Promise((resolve) => {
    const child = spawn('pnpm', args, {
      cwd: root,
      stdio: 'inherit',
      // pnpm is a .cmd/.ps1 shim on Windows and needs the shell.
      shell: process.platform === 'win32',
    });

    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', () => resolve(1));
  });

  if (code !== 0) {
    console.error(`\ntest-all: ${name} failed with exit code ${code}`);
    process.exit(code);
  }
}

console.log('\ntest-all: unit + e2e both passed');
