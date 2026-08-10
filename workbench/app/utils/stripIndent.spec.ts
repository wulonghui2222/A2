import { describe, expect, it } from 'vitest';
import { stripIndents } from './stripIndent';

describe('stripIndents', () => {
  it('trims indentation from every line of a plain string', () => {
    const input = `
      line one
        line two
      line three
    `;

    expect(stripIndents(input)).toBe('line one\nline two\nline three');
  });

  it('works as a template tag with interpolations', () => {
    const name = 'bolt';
    const result = stripIndents`
      hello ${name}
      second line
    `;

    expect(result).toBe('hello bolt\nsecond line');
  });

  it('handles missing interpolation values gracefully', () => {
    const parts = ['a', 'b'] as unknown as TemplateStringsArray;

    expect(stripIndents(parts)).toBe('ab');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(stripIndents('   \n   \n  ')).toBe('');
  });

  it('strips a trailing newline', () => {
    expect(stripIndents('one\ntwo\n')).toBe('one\ntwo');
  });
});
