import { describe, expect, it } from 'vitest';
import { classNames } from './classNames';

describe('classNames', () => {
  it('joins string arguments', () => {
    expect(classNames('a', 'b', 'c')).toBe('a b c');
  });

  it('keeps truthy object keys and drops falsy ones', () => {
    expect(classNames({ a: true, b: false, c: true })).toBe('a c');
  });

  it('supports nested arrays', () => {
    expect(classNames(['a', ['b', { c: true }]])).toBe('a b c');
  });

  it('ignores undefined arguments', () => {
    expect(classNames(undefined, 'a', undefined)).toBe('a');
  });

  it('returns an empty string with no arguments', () => {
    expect(classNames()).toBe('');
  });

  it('mixes strings, objects and arrays', () => {
    expect(classNames('base', { active: true, disabled: false }, ['extra'])).toBe('base active extra');
  });
});
