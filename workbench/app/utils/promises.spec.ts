import { describe, expect, it } from 'vitest';
import { withResolvers } from './promises';

describe('withResolvers', () => {
  it('returns a promise with resolve and reject handles', () => {
    const { promise, resolve, reject } = withResolvers<number>();

    expect(promise).toBeInstanceOf(Promise);
    expect(typeof resolve).toBe('function');
    expect(typeof reject).toBe('function');
  });

  it('resolves the promise with the provided value', async () => {
    const { promise, resolve } = withResolvers<string>();

    resolve('done');

    await expect(promise).resolves.toBe('done');
  });

  it('rejects the promise with the provided reason', async () => {
    const { promise, reject } = withResolvers<string>();

    reject(new Error('boom'));

    await expect(promise).rejects.toThrow('boom');
  });
});
