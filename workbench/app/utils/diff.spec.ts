import { describe, expect, it } from 'vitest';
import { computeFileModifications, diffFiles, extractRelativePath, fileModificationsToHTML } from './diff';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from './constants';
import type { FileMap } from '~/lib/stores/files';

describe('Diff', () => {
  it('should strip out Work_dir', () => {
    const filePath = `${WORK_DIR}/index.js`;
    const result = extractRelativePath(filePath);
    expect(result).toBe('index.js');
  });

  it('keeps paths outside the work dir unchanged', () => {
    expect(extractRelativePath('/tmp/other/index.js')).toBe('/tmp/other/index.js');
  });

  describe('diffFiles', () => {
    it('returns undefined for identical content', () => {
      expect(diffFiles('a.js', 'same', 'same')).toBeUndefined();
    });

    it('returns a unified diff without the patch header', () => {
      const diff = diffFiles('a.js', 'old line', 'new line');

      expect(diff).toBeDefined();
      expect(diff).toContain('-old line');
      expect(diff).toContain('+new line');
      expect(diff).not.toContain(`--- a.js`);
      expect(diff).not.toContain(`+++ a.js`);
    });
  });

  describe('computeFileModifications', () => {
    it('returns undefined when nothing changed', () => {
      const files = {
        [`${WORK_DIR}/a.js`]: { type: 'file', content: 'same', isBinary: false },
      } as unknown as FileMap;

      expect(computeFileModifications(files, new Map([[`${WORK_DIR}/a.js`, 'same']]))).toBeUndefined();
    });

    it('emits a diff entry for a modified file', () => {
      // Content long enough that the unified diff stays smaller than the file.
      const original = Array.from({ length: 20 }, (_, i) => `line ${i} unchanged`).join('\n');
      const modified = original.replace('line 5 unchanged', 'line 5 changed');

      const files = {
        [`${WORK_DIR}/a.js`]: { type: 'file', content: modified, isBinary: false },
      } as unknown as FileMap;

      const modifications = computeFileModifications(files, new Map([[`${WORK_DIR}/a.js`, original]]));

      expect(modifications).toBeDefined();
      expect(modifications![`${WORK_DIR}/a.js`].type).toBe('diff');
      expect(modifications![`${WORK_DIR}/a.js`].content).toContain('+line 5 changed');
    });

    it('falls back to full content when the diff is larger than the file', () => {
      const files = {
        [`${WORK_DIR}/a.js`]: { type: 'file', content: 'x', isBinary: false },
      } as unknown as FileMap;

      const modifications = computeFileModifications(
        files,
        new Map([[`${WORK_DIR}/a.js`, 'completely different and much longer original content']]),
      );

      expect(modifications![`${WORK_DIR}/a.js`].type).toBe('file');
      expect(modifications![`${WORK_DIR}/a.js`].content).toBe('x');
    });

    it('skips folders and unknown files', () => {
      const files = {
        [`${WORK_DIR}/dir`]: { type: 'folder' },
      } as unknown as FileMap;

      expect(computeFileModifications(files, new Map([[`${WORK_DIR}/dir`, 'old']]))).toBeUndefined();
    });
  });

  describe('fileModificationsToHTML', () => {
    it('returns undefined for empty modifications', () => {
      expect(fileModificationsToHTML({})).toBeUndefined();
    });

    it('wraps entries in the modifications tag', () => {
      const html = fileModificationsToHTML({
        '/home/project/a.js': { type: 'diff', content: '+x' },
      });

      expect(html).toContain(`<${MODIFICATIONS_TAG_NAME}>`);
      expect(html).toContain(`<diff path="/home/project/a.js">`);
      expect(html).toContain('+x');
      expect(html).toContain(`</${MODIFICATIONS_TAG_NAME}>`);
    });
  });
});
