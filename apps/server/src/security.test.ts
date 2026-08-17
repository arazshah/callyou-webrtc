import { describe, expect, it } from 'vitest';
import { createSessionToken, generateSlug, verifySessionToken } from './security.js';
describe('sessions', () => {
  it('rejects tampering', () => {
    const secret = 'a'.repeat(32);
    const token = createSessionToken('session-id', secret);
    expect(verifySessionToken(token, secret)).toBe('session-id');
    expect(verifySessionToken(`${token}x`, secret)).toBeNull();
  });
});
describe('generated slugs', () => {
  it('are readable and distinct', () =>
    expect(generateSlug()).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]+$/));
});
