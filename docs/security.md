# Security

Threat boundaries are the HTTP body, URL slug, cookies, every socket event, Yjs binary updates, display names, and board text. Shared Zod schemas reject malformed inputs; text is rendered through React/SVG text nodes and never as HTML. SQL is parameterized. Prototype-bearing objects are never merged into configuration or server state.

Room URLs contain high-entropy readable slugs and act as invitations; they must only be shared with the intended participant. Opaque session IDs are integrity-protected with HMAC-SHA256 and verified against server-side room, role, expiry, and revocation state. Production cookies are Secure, HTTP-only, SameSite strict. Exact-origin Socket.IO checks, room-scoped authorization, size limits, creation/join rate limits, Helmet CSP, Permissions-Policy and Caddy HSTS are enabled.

Never log cookies, session tokens, TURN credentials, SDP, detailed ICE data, or full board text. Fastify redaction covers cookies. Rotate `SESSION_SECRET` to invalidate all sessions; rotate `TURN_SHARED_SECRET` jointly in server and coturn. Place `.env` at mode 0600 and restrict Docker/socket access.

This is transport security, not full application E2EE. WebRTC media is encrypted in transit; HTTPS/WSS protects signaling and whiteboard traffic; the application server can decode board snapshots. Report vulnerabilities privately and keep Node, base images, PostgreSQL, Caddy, and coturn patched.

Imported board images and rendered PDF pages are persisted inside the board snapshot. Chat messages and attachments are validated, size-bounded, relayed only to the current room over Socket.IO, and are not persisted by the application. Users should still avoid sharing sensitive files because the server relays chat traffic and can access board snapshots.

## Local recording consent

Call recording is client-side only. The requester must receive an explicit, matching consent response from the other authenticated room participant before the UI starts `MediaRecorder`. Recording status is shown to both participants, the resulting WebM file is downloaded only to the requester's device, and no recording bytes are sent to or stored by CallYou.
