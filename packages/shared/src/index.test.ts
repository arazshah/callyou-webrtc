import { describe, expect, it } from 'vitest';
import {
  boardElementSchema,
  boardPageSchema,
  laserSchema,
  chatMessageSchema,
  iceCandidateSchema,
  LIMITS,
  liveStrokeSchema,
  normalizeSlug,
  signalSchema,
  recordingRequestSchema,
  recordingResponseSchema,
  viewportSchema,
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
  it('accepts bounded page metadata', () => {
    expect(
      boardPageSchema.safeParse({
        id: crypto.randomUUID(),
        title: 'Lesson 1',
        createdAt: 1,
        updatedAt: 1,
      }).success,
    ).toBe(true);
  });
  it('accepts viewport and laser events within bounds', () => {
    expect(viewportSchema.safeParse({ centerX: 10, centerY: -4, zoom: 1.25 }).success).toBe(true);
    expect(
      laserSchema.safeParse({ x: 10, y: 20, active: true, pageId: crypto.randomUUID() }).success,
    ).toBe(true);
  });
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
  it('accepts bounded board images and rejects missing image data', () => {
    const base = {
      id: crypto.randomUUID(),
      type: 'image',
      createdBy: 'p',
      createdAt: 1,
      updatedAt: 1,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      assetName: 'lesson.webp',
      strokeColor: '#000000',
      strokeWidth: 1,
      opacity: 1,
    };
    expect(
      boardElementSchema.safeParse({ ...base, assetData: 'data:image/webp;base64,YQ==' }).success,
    ).toBe(true);
    expect(boardElementSchema.safeParse(base).success).toBe(false);
  });
  it('publishes finite board and socket limits', () => {
    expect(LIMITS.yjsUpdateBytes).toBeLessThan(LIMITS.socketBytes);
    expect(LIMITS.boardAssets).toBe(12);
  });
});

describe('chat validation', () => {
  it('accepts text and bounded attachments but rejects empty messages', () => {
    expect(chatMessageSchema.safeParse({ id: crypto.randomUUID(), text: 'سلام 👋' }).success).toBe(
      true,
    );
    expect(
      chatMessageSchema.safeParse({
        id: crypto.randomUUID(),
        attachment: {
          name: 'note.txt',
          type: 'text/plain',
          size: 1,
          data: 'data:text/plain;base64,YQ==',
        },
      }).success,
    ).toBe(true);
    expect(chatMessageSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(false);
  });
});

describe('signaling validation', () => {
  it('rejects oversized SDP and malformed ICE', () => {
    expect(
      signalSchema.safeParse({ description: { type: 'offer', sdp: 'x'.repeat(128001) } }).success,
    ).toBe(false);
    expect(iceCandidateSchema.safeParse({ candidate: { candidate: 7 } }).success).toBe(false);
  });
});

describe('recording consent validation', () => {
  const requestId = 'd9428888-122b-4e1e-b85b-14d10eaf1676';
  it('accepts bounded consent messages', () => {
    expect(recordingRequestSchema.safeParse({ requestId }).success).toBe(true);
    expect(recordingResponseSchema.safeParse({ requestId, accepted: true }).success).toBe(true);
  });
  it('rejects malformed consent messages', () => {
    expect(recordingRequestSchema.safeParse({ requestId: 'not-an-id' }).success).toBe(false);
    expect(recordingResponseSchema.safeParse({ requestId, accepted: 'yes' }).success).toBe(false);
  });
});
