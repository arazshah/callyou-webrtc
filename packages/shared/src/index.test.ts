import { describe, expect, it } from 'vitest';
import {
  boardElementSchema,
  iceCandidateSchema,
  LIMITS,
  liveStrokeSchema,
  normalizeSlug,
  signalSchema,
  slugSchema,
  createRoomSchema,
  joinRoomSchema,
} from './index.js';

describe('passwordless entry', () => {
  it('accepts only a display name', () => {
    expect(createRoomSchema.safeParse({ displayName: 'Araz' }).success).toBe(true);
    expect(joinRoomSchema.safeParse({ displayName: 'Guest' }).success).toBe(true);
  });
  it('rejects legacy room fields', () => {
    expect(createRoomSchema.safeParse({ displayName: 'Araz', password: 'secret' }).success).toBe(
      false,
    );
  });
});

describe('room slugs', () => {
  it('normalizes case and whitespace', () => expect(normalizeSlug('  My-Room ')).toBe('my-room'));
  it.each(['ab', '-abc', 'abc-', 'hello_world', 'admin', 'API'])('rejects %s', (value) =>
    expect(slugSchema.safeParse(value).success).toBe(false),
  );
  it.each(['abc', 'room-42', 'a'.repeat(50)])('accepts %s', (value) =>
    expect(slugSchema.safeParse(value).success).toBe(true),
  );
});

describe('board validation', () => {
  it('rejects HTML-like invalid colors and overly long text', () => {
    const result = boardElementSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'text',
      createdBy: 'p',
      createdAt: 1,
      updatedAt: 1,
      x: 0,
      y: 0,
      text: 'x'.repeat(2001),
      strokeColor: '<script>',
      strokeWidth: 2,
      opacity: 1,
    });
    expect(result.success).toBe(false);
  });
  it('caps live stroke batches', () =>
    expect(
      liveStrokeSchema.safeParse({
        id: crypto.randomUUID(),
        points: Array.from({ length: 257 }, () => ({ x: 0, y: 0 })),
        color: '#000000',
        width: 2,
        opacity: 1,
      }).success,
    ).toBe(false));
  it('publishes a finite encoded-update limit', () =>
    expect(LIMITS.yjsUpdateBytes).toBe(512 * 1024));
});

describe('signaling validation', () => {
  it('rejects oversized SDP and malformed ICE', () => {
    expect(
      signalSchema.safeParse({ description: { type: 'offer', sdp: 'x'.repeat(128001) } }).success,
    ).toBe(false);
    expect(iceCandidateSchema.safeParse({ candidate: { candidate: 7 } }).success).toBe(false);
  });
});
