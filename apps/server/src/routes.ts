import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac } from 'node:crypto';
import { createRoomSchema, joinRoomSchema, slugSchema } from '@callyou/shared';
import type { Config } from './config.js';
import type { BoardManager } from './board.js';
import { RoomError, type RoomService } from './rooms.js';
import { createSessionToken, verifySessionToken } from './security.js';

const COOKIE = 'callyou_session';
function sessionId(request: FastifyRequest, config: Config) {
  return verifySessionToken(request.cookies[COOKIE], config.SESSION_SECRET);
}
function setSession(reply: FastifyReply, id: string, config: Config) {
  reply.setCookie(COOKIE, createSessionToken(id, config.SESSION_SECRET), {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: config.SESSION_HOURS * 3600,
  });
}
export function registerRoutes(
  app: FastifyInstance,
  rooms: RoomService,
  board: BoardManager,
  config: Config,
  broadcast: (roomId: string, event: string) => void,
) {
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/ready', async (_request, reply) => {
    try {
      await app.pg.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.post(
    '/api/rooms',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const parsed = createRoomSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          code: 'invalid_input',
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      try {
        const result = await rooms.create(parsed.data);
        setSession(reply, result.sessionId, config);
        return reply.code(201).send({ slug: result.slug });
      } catch (error) {
        return handleError(error, reply, request);
      }
    },
  );
  app.post(
    '/api/rooms/:slug/join',
    { config: { rateLimit: { max: 8, timeWindow: '10 minutes', ban: 3 } } },
    async (request, reply) => {
      const slug = slugSchema.safeParse((request.params as { slug?: string }).slug);
      const body = joinRoomSchema.safeParse(request.body);
      if (!slug.success || !body.success) return reply.code(400).send({ code: 'invalid_input' });
      try {
        const result = await rooms.join(
          slug.data,
          body.data.displayName,
          sessionId(request, config),
        );
        setSession(reply, result.sessionId, config);
        return { ok: true };
      } catch (error) {
        return handleError(error, reply, request);
      }
    },
  );
  app.get('/api/rooms/:slug/status', async (request, reply) => {
    const slug = slugSchema.safeParse((request.params as { slug?: string }).slug);
    if (!slug.success) return reply.code(404).send({ code: 'room_unavailable' });
    const auth = await rooms.authenticate(sessionId(request, config), slug.data);
    return auth
      ? { authenticated: true, role: auth.role, displayName: auth.displayName }
      : { authenticated: false };
  });
  app.post('/api/rooms/:slug/leave', async (request, reply) => {
    const auth = await authFor(request, rooms, config);
    if (!auth) return reply.code(401).send({ code: 'unauthorized' });
    await rooms.leave(auth.sessionId);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
  app.post('/api/rooms/:slug/end', async (request, reply) => {
    const auth = await authFor(request, rooms, config);
    if (!auth) return reply.code(401).send({ code: 'unauthorized' });
    try {
      await rooms.end(auth.roomId, auth.sessionId);
      broadcast(auth.roomId, 'room:ended');
      board.remove(auth.roomId);
      reply.clearCookie(COOKIE, { path: '/' });
      return { ok: true };
    } catch (error) {
      return handleError(error, reply, request);
    }
  });
  app.post('/api/rooms/:slug/clear-board', async (request, reply) => {
    const auth = await authFor(request, rooms, config);
    if (!auth) return reply.code(401).send({ code: 'unauthorized' });
    if (auth.role !== 'host') return reply.code(403).send({ code: 'forbidden' });
    await board.clear(auth.roomId);
    broadcast(auth.roomId, 'board:cleared');
    return { ok: true };
  });
  app.get('/api/rooms/:slug/turn-credentials', async (request, reply) => {
    const auth = await authFor(request, rooms, config);
    if (!auth) return reply.code(401).send({ code: 'unauthorized' });
    if (!config.TURN_HOST || !config.TURN_SHARED_SECRET)
      return { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] };
    const expires = Math.floor(Date.now() / 1000) + config.TURN_TTL_SECONDS;
    const username = `${expires}:${auth.participantId}`;
    const credential = createHmac('sha1', config.TURN_SHARED_SECRET)
      .update(username)
      .digest('base64');
    return {
      iceServers: [
        {
          urls: [
            `stun:${config.TURN_HOST}:3478`,
            `turn:${config.TURN_HOST}:3478?transport=udp`,
            `turn:${config.TURN_HOST}:3478?transport=tcp`,
          ],
          username,
          credential,
        },
      ],
    };
  });
}
async function authFor(request: FastifyRequest, rooms: RoomService, config: Config) {
  const slug = slugSchema.safeParse((request.params as { slug?: string }).slug);
  return slug.success ? rooms.authenticate(sessionId(request, config), slug.data) : null;
}
function handleError(error: unknown, reply: FastifyReply, request: FastifyRequest) {
  if (error instanceof RoomError) return reply.code(error.statusCode).send({ code: error.code });
  request.log.error({ err: error, category: 'room_operation' }, 'Room operation failed');
  return reply.code(500).send({ code: 'internal_error' });
}

declare module 'fastify' {
  interface FastifyInstance {
    pg: import('pg').Pool;
  }
}
