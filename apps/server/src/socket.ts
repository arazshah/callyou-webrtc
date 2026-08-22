import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  chatMessageSchema,
  cursorSchema,
  iceCandidateSchema,
  laserSchema,
  LIMITS,
  liveStrokeSchema,
  recordingRequestSchema,
  recordingResponseSchema,
  recordingStatusSchema,
  screenShareStatusSchema,
  viewportSchema,
  roomJoinEventSchema,
  signalSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@callyou/shared';
import * as Y from 'yjs';
import type { Config } from './config.js';
import type { BoardManager } from './board.js';
import type { RoomService } from './rooms.js';
import { verifySessionToken } from './security.js';

function readCookie(header: string | undefined, name: string) {
  return header
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}
export function createSocketServer(
  server: HttpServer,
  rooms: RoomService,
  board: BoardManager,
  config: Config,
) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    path: '/socket.io',
    maxHttpBufferSize: LIMITS.socketBytes,
    cors: { origin: config.APP_URL, credentials: true },
    allowRequest: (request, callback) =>
      callback(null, !request.headers.origin || request.headers.origin === config.APP_URL),
  });
  const participantSockets = new Map<string, Set<string>>();
  io.on('connection', (socket) => {
    const token = safeDecode(readCookie(socket.handshake.headers.cookie, 'callyou_session') ?? '');
    const verifiedSessionId = verifySessionToken(token, config.SESSION_SECRET);
    let current: Awaited<ReturnType<RoomService['authenticate']>> = null;
    socket.on('room:join', async (payload, ack) => {
      const parsed = roomJoinEventSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, code: 'invalid_payload' });
      const auth = await rooms.authenticate(verifiedSessionId, parsed.data.slug);
      if (!auth) return ack({ ok: false, code: 'unauthorized' });
      current = auth;
      const set = participantSockets.get(auth.participantId) ?? new Set<string>();
      const firstSocket = set.size === 0;
      set.add(socket.id);
      participantSockets.set(auth.participantId, set);
      await socket.join(auth.roomId);
      await rooms.touch(auth.sessionId);
      const doc = await board.get(auth.roomId);
      const sockets = await io.in(auth.roomId).fetchSockets();
      const peers = sockets
        .filter(
          (item) =>
            item.id !== socket.id &&
            item.data.participantId &&
            item.data.participantId !== auth.participantId,
        )
        .map((item) => ({
          participantId: item.data.participantId as string,
          displayName: item.data.displayName as string,
          color: item.data.color as string,
        }))
        .filter(
          (peer, index, all) =>
            all.findIndex((item) => item.participantId === peer.participantId) === index,
        );
      socket.data = {
        participantId: auth.participantId,
        displayName: auth.displayName,
        color: auth.color,
      };
      socket.emit('room:joined', {
        participantId: auth.participantId,
        role: auth.role,
        displayName: auth.displayName,
        color: auth.color,
        peers,
      });
      socket.emit('board:sync', Y.encodeStateAsUpdate(doc));
      if (firstSocket)
        socket.to(auth.roomId).emit('participant:joined', {
          participantId: auth.participantId,
          displayName: auth.displayName,
          color: auth.color,
        });
      ack({ ok: true });
    });
    const authorized =
      <T>(
        schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
        handler: (data: T) => void | Promise<void>,
      ) =>
      (value: unknown) => {
        if (!current) return;
        const result = schema.safeParse(value);
        if (result.success) void handler(result.data as T);
      };
    socket.on(
      'participant:cursor',
      authorized(cursorSchema, (data) => {
        socket.to(current!.roomId).emit('participant:cursor', {
          ...data,
          participantId: current!.participantId,
          displayName: current!.displayName,
          color: current!.color,
        });
      }),
    );
    socket.on(
      'board:live-stroke',
      authorized(liveStrokeSchema, (data) => {
        socket
          .to(current!.roomId)
          .emit('board:live-stroke', { ...data, participantId: current!.participantId });
      }),
    );
    socket.on(
      'board:live-stroke-end',
      authorized(
        {
          safeParse: (v: unknown) =>
            typeof (v as { id?: unknown })?.id === 'string'
              ? { success: true, data: v as { id: string } }
              : { success: false },
        },
        (data) => {
          socket
            .to(current!.roomId)
            .emit('board:live-stroke-end', { ...data, participantId: current!.participantId });
        },
      ),
    );
    socket.on('board:yjs-update', async (value) => {
      if (!current || !(value instanceof Uint8Array || Buffer.isBuffer(value))) return;
      const update = new Uint8Array(value);
      if (await board.apply(current.roomId, update))
        socket.to(current.roomId).emit('board:yjs-update', update);
      else socket.emit('room:error', { code: 'board_update_rejected' });
    });
    socket.on('board:sync-request', async () => {
      if (current)
        socket.emit('board:sync', Y.encodeStateAsUpdate(await board.get(current.roomId)));
    });
    socket.on(
      'board:viewport',
      authorized(viewportSchema, (data) => {
        socket.to(current!.roomId).emit('board:viewport', {
          ...data,
          participantId: current!.participantId,
          displayName: current!.displayName,
        });
      }),
    );
    socket.on(
      'board:laser',
      authorized(laserSchema, (data) => {
        socket.to(current!.roomId).emit('board:laser', {
          ...data,
          participantId: current!.participantId,
          displayName: current!.displayName,
          color: current!.color,
        });
      }),
    );
    socket.on('chat:send', async (value, ack) => {
      if (!current) return ack({ ok: false, code: 'unauthorized' });
      const parsed = chatMessageSchema.safeParse(value);
      if (!parsed.success) return ack({ ok: false, code: 'invalid_payload' });
      try {
        await rooms.touch(current.sessionId);
        io.to(current.roomId).emit('chat:message', {
          ...parsed.data,
          participantId: current.participantId,
          displayName: current.displayName,
          color: current.color,
          sentAt: Date.now(),
        });
        ack({ ok: true });
      } catch {
        ack({ ok: false, code: 'send_failed' });
      }
    });
    socket.on(
      'webrtc:offer',
      authorized(signalSchema, (data) => {
        socket.to(current!.roomId).emit('webrtc:offer', data);
      }),
    );
    socket.on(
      'webrtc:answer',
      authorized(signalSchema, (data) => {
        socket.to(current!.roomId).emit('webrtc:answer', data);
      }),
    );
    socket.on(
      'webrtc:ice-candidate',
      authorized(iceCandidateSchema, (data) => {
        socket.to(current!.roomId).emit('webrtc:ice-candidate', data);
      }),
    );
    socket.on('webrtc:restart-ice', () => {
      if (current) socket.to(current.roomId).emit('webrtc:restart-ice');
    });
    socket.on(
      'recording:request',
      authorized(recordingRequestSchema, (data) => {
        socket.to(current!.roomId).emit('recording:requested', {
          ...data,
          participantId: current!.participantId,
          displayName: current!.displayName,
        });
      }),
    );
    socket.on(
      'recording:response',
      authorized(recordingResponseSchema, (data) => {
        socket.to(current!.roomId).emit('recording:response', data);
      }),
    );
    socket.on(
      'recording:status',
      authorized(recordingStatusSchema, (data) => {
        socket.to(current!.roomId).emit('recording:status', {
          ...data,
          participantId: current!.participantId,
        });
      }),
    );
    socket.on(
      'screen:status',
      authorized(screenShareStatusSchema, (data) => {
        socket.to(current!.roomId).emit('screen:status', {
          ...data,
          participantId: current!.participantId,
        });
      }),
    );
    socket.on('disconnect', async () => {
      if (!current) return;
      const set = participantSockets.get(current.participantId);
      set?.delete(socket.id);
      if (!set?.size) {
        participantSockets.delete(current.participantId);
        await rooms.touch(current.sessionId);
        io.to(current.roomId).emit('participant:left', { participantId: current.participantId });
      }
    });
  });
  const heartbeat = setInterval(
    () => {
      for (const sockets of participantSockets.values()) {
        const socketId = sockets.values().next().value as string | undefined;
        const socket = socketId ? io.sockets.sockets.get(socketId) : undefined;
        if (socket) {
          const token = safeDecode(
            readCookie(socket.handshake.headers.cookie, 'callyou_session') ?? '',
          );
          const id = verifySessionToken(token, config.SESSION_SECRET);
          if (id) void rooms.touch(id);
        }
      }
    },
    Math.max(5000, config.RECONNECT_GRACE_SECONDS * 500),
  );
  return {
    io,
    close: async () => {
      clearInterval(heartbeat);
      await io.close();
    },
    broadcast: (roomId: string, event: string) => {
      if (event === 'room:ended') {
        io.to(roomId).emit('room:ended');
        io.in(roomId).disconnectSockets(true);
      } else if (event === 'board:cleared') io.to(roomId).emit('board:cleared');
    },
  };
}
