import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/*
 * A2 test-suite (TS-01, design D1): throwaway SQLite database for server-side
 * unit tests. Never touches the developer's prisma/a2.db: db.server.ts keeps
 * its hardcoded path, so tests bypass it and construct their own client
 * against a temp file created from the real schema.
 */

export interface TestDb {
  prisma: PrismaClient;
  dispose: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), 'a2-test-db-'));
  const dbPath = join(dir, 'a2-test.db');
  const databaseUrl = `file:${dbPath}`;

  // argv form (no shell): runs the locally installed prisma CLI entry.
  execFileSync(
    process.execPath,
    [
      join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
      'db',
      'push',
      '--schema',
      'prisma/schema.prisma',
      '--skip-generate',
      '--accept-data-loss',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    },
  );

  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

  return {
    prisma,
    dispose: async () => {
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
