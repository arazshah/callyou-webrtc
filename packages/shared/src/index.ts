import { z } from 'zod';

export const LIMITS = {
  displayName: 40,
  boardText: 2000,
  boardElements: 10_000,
  strokePoints: 5_000,
  yjsUpdateBytes: 512 * 1024,
  socketBytes: 1024 * 1024,
} as const;

export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'login',
  'signup',
  'room',
  'rooms',
  'assets',
  'settings',
  'health',
]);

export function normalizeSlug(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export const slugSchema = z
  .string()
  .transform(normalizeSlug)
  .pipe(z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/, 'invalid_slug'))
  .refine((slug) => !RESERVED_SLUGS.has(slug), 'reserved_slug');

const safeName = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.displayName)
  .refine(
    (value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
      }),
    'control_characters',
  );

export const createRoomSchema = z.object({ displayName: safeName }).strict();
export const joinRoomSchema = z.object({ displayName: safeName }).strict();
export type RoomRole = 'host' | 'guest';
export type RoomStatus = 'active' | 'ended' | 'expired';

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().min(0).max(1).optional(),
});
export const boardElementSchema = z.object({
  id: z.uuid(),
  type: z.enum(['pen', 'highlighter', 'line', 'arrow', 'rectangle', 'ellipse', 'text']),
  createdBy: z.string().min(1).max(100),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
  rotation: z.number().finite().optional(),
  points: z.array(pointSchema).max(LIMITS.strokePoints).optional(),
  text: z.string().max(LIMITS.boardText).optional(),
  strokeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  fillColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  strokeWidth: z.number().min(0.5).max(80),
  opacity: z.number().min(0).max(1),
});
export type BoardElement = z.infer<typeof boardElementSchema>;

export const roomJoinEventSchema = z.object({ slug: slugSchema });
export const cursorSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const liveStrokeSchema = z.object({
  id: z.uuid(),
  points: z.array(pointSchema).max(256),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().min(0.5).max(80),
  opacity: z.number().min(0).max(1),
});
export const signalSchema = z.object({
  description: z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(128_000) }),
});
export const iceCandidateSchema = z.object({
  candidate: z.object({
    candidate: z.string().max(4096),
    sdpMid: z.string().max(128).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }),
});

export interface ServerToClientEvents {
  'room:joined': (data: {
    participantId: string;
    role: RoomRole;
    displayName: string;
    color: string;
    peers: Array<{ participantId: string; displayName: string; color: string }>;
  }) => void;
  'room:error': (data: { code: string }) => void;
  'room:ended': () => void;
  'participant:joined': (data: {
    participantId: string;
    displayName: string;
    color: string;
  }) => void;
  'participant:left': (data: { participantId: string }) => void;
  'participant:cursor': (data: {
    participantId: string;
    displayName: string;
    color: string;
    x: number;
    y: number;
  }) => void;
  'board:yjs-update': (update: Uint8Array) => void;
  'board:sync': (update: Uint8Array) => void;
  'board:live-stroke': (data: z.infer<typeof liveStrokeSchema> & { participantId: string }) => void;
  'board:live-stroke-end': (data: { participantId: string; id: string }) => void;
  'board:cleared': () => void;
  'webrtc:offer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:answer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:ice-candidate': (data: z.infer<typeof iceCandidateSchema>) => void;
  'webrtc:restart-ice': () => void;
}
export interface ClientToServerEvents {
  'room:join': (
    data: { slug: string },
    ack: (result: { ok: boolean; code?: string }) => void,
  ) => void;
  'participant:cursor': (data: z.infer<typeof cursorSchema>) => void;
  'board:yjs-update': (update: Uint8Array) => void;
  'board:sync-request': () => void;
  'board:live-stroke': (data: z.infer<typeof liveStrokeSchema>) => void;
  'board:live-stroke-end': (data: { id: string }) => void;
  'webrtc:offer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:answer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:ice-candidate': (data: z.infer<typeof iceCandidateSchema>) => void;
  'webrtc:restart-ice': () => void;
}
