import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, type Config } from './config.js';
import { createDatabase } from './db/index.js';
import { BoardManager } from './board.js';
import { RoomService } from './rooms.js';
import { registerRoutes } from './routes.js';
import { createSocketServer } from './socket.js';

export async function buildApp(config: Config = loadConfig()) {
  const app = Fastify({
    logger: {
      redact: ['req.headers.cookie'],
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    bodyLimit: 64 * 1024,
    trustProxy: config.NODE_ENV === 'production',
    requestIdHeader: 'x-request-id',
  });
  const database = createDatabase(config);
  app.decorate('pg', database.pool);
  await app.register(cookie);
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://coffeebede.ir'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  });
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  });
  app.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin && origin !== config.APP_URL)
        return reply.code(403).send({ code: 'invalid_origin' });
    }
  });
  await app.register(rateLimit, { global: false });
  const rooms = new RoomService(database.pool, config);
  const board = new BoardManager(database.pool);
  const sockets = createSocketServer(app.server, rooms, board, config);
  registerRoutes(app, rooms, board, config, sockets.broadcast);
  const cleanup = setInterval(
    () =>
      void rooms
        .expireInactive()
        .catch((error) => app.log.error({ err: error }, 'Room cleanup failed')),
    15 * 60_000,
  );
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    await board.flushAll();
    await sockets.close();
    await database.pool.end();
  });
  return app;
}
