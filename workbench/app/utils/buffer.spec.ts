import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// bufferWatchEvents schedules via self.setTimeout; provide it in the node env.
(globalThis as any).self = globalThis;

import { bufferWatchEvents } from './buffer';

describe('bufferWatchEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers events batched after the buffer window', async () => {
    const cb = vi.fn();
    const push = bufferWatchEvents<[string]>(10, cb);

    push('a');
    push('b');

    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10);
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledTimes(1);
    });

    expect(cb).toHaveBeenCalledWith([['a'], ['b']]);
  });

  it('schedules a single timer for the whole batch', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const cb = vi.fn();
    const push = bufferWatchEvents<[number]>(10, cb);

    push(1);
    push(2);
    push(3);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('delivers later events in a new batch', async () => {
    const cb = vi.fn();
    const push = bufferWatchEvents<[string]>(10, cb);

    push('a');
    vi.advanceTimersByTime(10);

    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledTimes(1);
    });

    push('b');
    vi.advanceTimersByTime(10);

    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledTimes(2);
    });

    expect(cb).toHaveBeenLastCalledWith([['b']]);
  });

  it('does not invoke the callback for an empty batch', async () => {
    const cb = vi.fn();
    bufferWatchEvents<[string]>(10, cb);

    vi.advanceTimersByTime(10);
    await Promise.resolve();

    expect(cb).not.toHaveBeenCalled();
  });
});
