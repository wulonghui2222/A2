import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// debounce calls window.setTimeout; provide the global in the node env.
(globalThis as any).window = globalThis;

import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the original function when delay is 0', () => {
    const fn = vi.fn();

    expect(debounce(fn, 0)).toBe(fn);
  });

  it('invokes the function only after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('restarts the timer on repeated calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    vi.advanceTimersByTime(30);
    debounced();
    vi.advanceTimersByTime(30);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the latest arguments and preserves this context', () => {
    const fn = vi.fn();
    const debounced = debounce(function (this: { value: number }, n: number) {
      fn(this.value, n);
    }, 10);

    const ctx = { value: 42 };

    debounced.call(ctx, 1);
    debounced.call(ctx, 2);
    vi.advanceTimersByTime(10);

    expect(fn).toHaveBeenCalledWith(42, 2);
  });
});
