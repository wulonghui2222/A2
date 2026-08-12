import { describe, expect, it } from 'vitest';
import {
  MAX_SNAPSHOT_BYTES,
  MAX_TOTAL_BYTES,
  isNmSnapshotCacheEnabled,
  planEviction,
  sha256Hex,
  type SnapshotCacheEntry,
} from './snapshot-cache';

function entry(key: string, sizeBytes: number, lastUsedAt: number): SnapshotCacheEntry {
  return { key, sizeBytes, createdAt: lastUsedAt, lastUsedAt };
}

describe('snapshot cache (design D1/D3/D6)', () => {
  describe('sha256Hex (design D3)', () => {
    it('hashes package.json content deterministically', async () => {
      const content = JSON.stringify({ name: 'demo', dependencies: { react: '^18.2.0' } });

      const first = await sha256Hex(content);
      const second = await sha256Hex(content);

      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(second).toBe(first);
    });

    it('produces different keys for different dependency sets', async () => {
      const a = await sha256Hex(JSON.stringify({ dependencies: { react: '^18.2.0' } }));
      const b = await sha256Hex(JSON.stringify({ dependencies: { react: '^18.3.0' } }));

      expect(a).not.toBe(b);
    });
  });

  describe('planEviction (design D6)', () => {
    it('keeps everything within the budget', () => {
      const entries = [entry('a', 50, 1), entry('b', 60, 2)];

      expect(planEviction(entries, 110, MAX_TOTAL_BYTES)).toEqual([]);
    });

    it('evicts least-recently-used first until within the budget', () => {
      const entries = [entry('old', 100, 1), entry('mid', 80, 2), entry('new', 80, 3)];

      const victims = planEviction(entries, 260, 200);

      expect(victims).toEqual(['old']);
    });

    it('evicts multiple entries when needed', () => {
      const entries = [entry('a', 90, 1), entry('b', 90, 2), entry('c', 90, 3)];

      const victims = planEviction(entries, 270, 100);

      expect(victims).toEqual(['a', 'b']);
    });
  });

  describe('limits (design D6)', () => {
    it('pins the documented thresholds', () => {
      expect(MAX_SNAPSHOT_BYTES).toBe(150 * 1024 * 1024);
      expect(MAX_TOTAL_BYTES).toBe(200 * 1024 * 1024);
    });
  });

  describe('isNmSnapshotCacheEnabled (design D8)', () => {
    it('is disabled outside the browser (SSR/tests)', () => {
      expect(isNmSnapshotCacheEnabled()).toBe(false);
    });
  });
});
