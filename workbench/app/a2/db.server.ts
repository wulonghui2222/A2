import { PrismaClient } from '@prisma/client';

// A2 (design D4, task 3.1): server-side Prisma singleton.
// The SQLite URL is resolved to an absolute path here so the CLI
// (`prisma db push`, which resolves relative to prisma/schema.prisma) and the
// runtime (cwd = repo root) always point at the same file: prisma/a2.db.
// NB: no 'node:path' import -- the nodePolyfills alias redirects builtin
// imports to browser polyfills under Vite dev SSR and crashes evaluation.
const dbPath = `${process.cwd().replace(/[\\/]$/, '')}/prisma/a2.db`;

declare global {
  // eslint-disable-next-line no-var
  var __a2Prisma: PrismaClient | undefined;
}

// Survive vite HMR reloads without leaking connections.
export const prisma: PrismaClient =
  globalThis.__a2Prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });

if (!globalThis.__a2Prisma) {
  globalThis.__a2Prisma = prisma;
}
