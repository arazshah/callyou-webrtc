import { z } from 'zod';

export const LIMITS = {
  displayName: 40,
  boardText: 2000,
  boardElements: 10_000,
  boardAssets: 12,
  boardAssetData: 650_000,
  strokePoints: 5_000,
  yjsUpdateBytes: 900 * 1024,
  socketBytes: 10 * 1024 * 1024,
  chatText: 2000,
  chatFileBytes: 2 * 1024 * 1024,
  chatAttachmentData: 2_850_000,
  boardPages: 24,
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
export const boardElementSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['pen', 'highlighter', 'line', 'arrow', 'rectangle', 'ellipse', 'text', 'image']),
    createdBy: z.string().min(1).max(100),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
    pageId: z.uuid().optional(),
    locked: z.boolean().optional(),
    zIndex: z.number().int().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    rotation: z.number().finite().optional(),
    points: z.array(pointSchema).max(LIMITS.strokePoints).optional(),
    text: z.string().max(LIMITS.boardText).optional(),
    assetName: z.string().trim().min(1).max(120).optional(),
    assetData: z
      .string()
      .max(LIMITS.boardAssetData)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i)
      .optional(),
    strokeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    fillColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    strokeWidth: z.number().min(0.5).max(80),
    opacity: z.number().min(0).max(1),
  })
  .superRefine((element, context) => {
    if (element.type === 'image') {
      if (!element.assetData || !element.assetName)
        context.addIssue({ code: 'custom', message: 'image_asset_required' });
      if ((element.width ?? 0) <= 0 || (element.height ?? 0) <= 0)
        context.addIssue({ code: 'custom', message: 'image_dimensions_required' });
    } else if (element.assetData || element.assetName) {
      context.addIssue({ code: 'custom', message: 'unexpected_image_asset' });
    }
  });
export type BoardElement = z.infer<typeof boardElementSchema>;
export const boardPageSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(80),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();
export type BoardPage = z.infer<typeof boardPageSchema>;

export const chatAttachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
    size: z.number().int().positive().max(LIMITS.chatFileBytes),
    data: z.string().max(LIMITS.chatAttachmentData),
  })
  .superRefine((attachment, context) => {
    const prefix = `data:${attachment.type};base64,`;
    if (
      !attachment.data.startsWith(prefix) ||
      !/^[a-z0-9+/]+={0,2}$/i.test(attachment.data.slice(prefix.length))
    )
      context.addIssue({ code: 'custom', message: 'attachment_type_mismatch' });
  });

export const chatMessageSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().max(LIMITS.chatText).optional(),
    attachment: chatAttachmentSchema.optional(),
  })
  .strict()
  .refine((message) => Boolean(message.text || message.attachment), 'empty_message');
export type ChatMessagePayload = z.infer<typeof chatMessageSchema>;
export type ChatMessage = ChatMessagePayload & {
  participantId: string;
  displayName: string;
  color: string;
  sentAt: number;
};

export const roomJoinEventSchema = z.object({ slug: slugSchema });
export const cursorSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const liveStrokeSchema = z.object({
  id: z.uuid(),
  pageId: z.uuid().optional(),
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
export const recordingRequestSchema = z.object({ requestId: z.uuid() }).strict();
export const recordingResponseSchema = z
  .object({ requestId: z.uuid(), accepted: z.boolean() })
  .strict();
export const recordingStatusSchema = z.object({ active: z.boolean() }).strict();
export const screenShareStatusSchema = z.object({ active: z.boolean() }).strict();
export const viewportSchema = z
  .object({
    centerX: z.number().finite(),
    centerY: z.number().finite(),
    zoom: z.number().min(0.2).max(5),
  })
  .strict();
export const laserSchema = z
  .object({
    pageId: z.uuid().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    active: z.boolean(),
  })
  .strict();

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
  'board:viewport': (data: {
    participantId: string;
    displayName: string;
    centerX: number;
    centerY: number;
    zoom: number;
  }) => void;
  'board:laser': (data: {
    participantId: string;
    displayName: string;
    color: string;
    pageId?: string | undefined;
    x: number;
    y: number;
    active: boolean;
  }) => void;
  'chat:message': (data: ChatMessage) => void;
  'webrtc:offer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:answer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:ice-candidate': (data: z.infer<typeof iceCandidateSchema>) => void;
  'webrtc:restart-ice': () => void;
  'recording:requested': (data: {
    requestId: string;
    participantId: string;
    displayName: string;
  }) => void;
  'recording:response': (data: { requestId: string; accepted: boolean }) => void;
  'recording:status': (data: { participantId: string; active: boolean }) => void;
  'screen:status': (data: { participantId: string; active: boolean }) => void;
}
export interface ClientToServerEvents {
  'room:join': (
    data: { slug: string },
    ack: (result: { ok: boolean; code?: string }) => void,
  ) => void;
  'participant:cursor': (data: z.infer<typeof cursorSchema>) => void;
  'board:yjs-update': (update: Uint8Array) => void;
  'board:sync-request': () => void;
  'board:viewport': (data: z.infer<typeof viewportSchema>) => void;
  'board:laser': (data: z.infer<typeof laserSchema>) => void;
  'board:live-stroke': (data: z.infer<typeof liveStrokeSchema>) => void;
  'board:live-stroke-end': (data: { id: string }) => void;
  'chat:send': (
    data: ChatMessagePayload,
    ack: (result: { ok: boolean; code?: string }) => void,
  ) => void;
  'webrtc:offer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:answer': (data: z.infer<typeof signalSchema>) => void;
  'webrtc:ice-candidate': (data: z.infer<typeof iceCandidateSchema>) => void;
  'webrtc:restart-ice': () => void;
  'recording:request': (data: z.infer<typeof recordingRequestSchema>) => void;
  'recording:response': (data: z.infer<typeof recordingResponseSchema>) => void;
  'recording:status': (data: z.infer<typeof recordingStatusSchema>) => void;
  'screen:status': (data: z.infer<typeof screenShareStatusSchema>) => void;
}
