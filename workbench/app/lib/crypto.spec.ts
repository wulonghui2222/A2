import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './crypto';

// AES-CBC needs a 16/24/32-byte key; base64 of 32 ASCII chars = 32 bytes.
const KEY = btoa('0123456789abcdef0123456789abcdef');
const OTHER_KEY = btoa('fedcba9876543210fedcba9876543210');

describe('encrypt / decrypt', () => {
  it('round-trips a string', async () => {
    const payload = await encrypt(KEY, 'hello workbench');

    expect(await decrypt(KEY, payload)).toBe('hello workbench');
  });

  it('round-trips unicode content', async () => {
    const payload = await encrypt(KEY, '项目广场 🚀 ünïcode');

    expect(await decrypt(KEY, payload)).toBe('项目广场 🚀 ünïcode');
  });

  it('produces different ciphertext for identical plaintext (random IV)', async () => {
    const a = await encrypt(KEY, 'same');
    const b = await encrypt(KEY, 'same');

    expect(a).not.toBe(b);
  });

  it('fails to decrypt with a different key', async () => {
    const payload = await encrypt(KEY, 'secret');

    await expect(decrypt(OTHER_KEY, payload)).rejects.toThrow();
  });
});
