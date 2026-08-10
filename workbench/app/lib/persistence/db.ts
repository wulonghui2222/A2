// A2 (design D4, task 3.3): the IndexedDB implementation has been replaced by
// the server-backed adapter in `app/a2/persistence/db.ts` (same signatures).
// This barrel keeps every existing import path (`~/lib/persistence/db`,
// `~/lib/persistence`) working without touching upstream call sites.
export * from '~/a2/persistence/db';
