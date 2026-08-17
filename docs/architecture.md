# Architecture

CallYou is a pnpm TypeScript monorepo: `apps/web` is React/Vite, `apps/server` is Fastify/Socket.IO, and `packages/shared` owns schemas and protocol types. PostgreSQL is the sole durable store. Caddy terminates TLS and serves the static SPA; coturn is independent media infrastructure.

Room creation generates a readable cryptographically random slug, inserts the room and host session in one transaction, and sets an HTTP-only cookie containing an HMAC-authenticated opaque session ID. Joining locks the room row, counts unique unrevoked sessions whose `active_until` is current, and inserts at most one guest. Multiple tabs reuse the cookie/session and therefore one slot. Socket heartbeats extend `active_until`; the last disconnect leaves a configurable grace interval.

Every Socket.IO connection re-authenticates the cookie and can join only its database-authorized room. The server never trusts client participant IDs or roles. Signaling and board events are broadcast only to that room. Active room documents are cached in memory and periodically encoded as compact Yjs updates in PostgreSQL. Graceful shutdown flushes them.

The cleanup query expires only inactive rooms and is idempotent. Default retention is 24 hours after activity. Ended rooms retain metadata for operational clarity but in-memory state is released; expired room board snapshots and sessions are deleted. Adjust retention with `ROOM_INACTIVITY_HOURS`.

## HTTP API

- `POST /api/rooms` creates a room and host session.
- `POST /api/rooms/:slug/join` atomically admits a name-only guest.
- `GET /api/rooms/:slug/status` reports only whether the current cookie is authorized.
- `POST /api/rooms/:slug/leave`, `/end`, and `/clear-board` mutate authorized room state.
- `GET /api/rooms/:slug/turn-credentials` returns short-lived credentials to participants only.
- `GET /api/health` is liveness; `/api/ready` checks PostgreSQL.

Socket events are declared in `packages/shared/src/index.ts`: room admission, participant presence/cursors, offer/answer/candidate/restart, Yjs sync/update, and ephemeral live strokes. Binary and semantic payload limits apply.
