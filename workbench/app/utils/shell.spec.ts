import { describe, expect, it } from 'vitest';
import { cleanTerminalOutput } from './shell';

describe('cleanTerminalOutput', () => {
  it('removes ANSI color codes', () => {
    expect(cleanTerminalOutput('\x1b[31merror\x1b[0m text')).toBe('error text');
  });

  it('removes OSC sequences', () => {
    expect(cleanTerminalOutput('\x1b]654;interactive\x07hello')).toBe('hello');
  });

  it('normalizes carriage returns and collapses long blank runs', () => {
    const cleaned = cleanTerminalOutput('line1\r\nline2\r\r\n\n\n\nline3');

    expect(cleaned).toContain('line1');
    expect(cleaned).toContain('line2');
    expect(cleaned).not.toContain('\r');
    expect(cleaned).not.toMatch(/\n{3,}/);
  });

  it('trims lines and drops empty ones', () => {
    expect(cleanTerminalOutput('  a  \n\n   \n b ')).toBe('a\nb');
  });

  it('collapses repeated spaces and normalizes colon spacing', () => {
    expect(cleanTerminalOutput('key:     value    here')).toBe('key: value here');
  });

  it('removes null characters', () => {
    expect(cleanTerminalOutput('a\u0000b')).toBe('ab');
  });

  it('returns an empty string for pure escape-sequence input', () => {
    expect(cleanTerminalOutput('\x1b[2J\x1b[H')).toBe('');
  });
});
