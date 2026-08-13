import { describe, expect, it } from 'vitest';
import { parseTriageOutput } from './triage';

describe('parseTriageOutput', () => {
  it('accepts the exact tokens', () => {
    expect(parseTriageOutput('trivial')).toBe('trivial');
    expect(parseTriageOutput('major')).toBe('major');
  });

  it('is case-insensitive and tolerant of surrounding text', () => {
    expect(parseTriageOutput('  MAJOR ')).toBe('major');
    expect(parseTriageOutput('判定结果：trivial')).toBe('trivial');
  });

  it('returns null for unusable output', () => {
    expect(parseTriageOutput('我不确定')).toBeNull();
    expect(parseTriageOutput('')).toBeNull();
  });
});
