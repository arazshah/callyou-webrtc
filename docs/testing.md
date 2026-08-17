# Testing

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Server business-logic tests cover session/capacity security; shared tests cover room/board validation. Browser tests exercise the default Persian shell. Integration tests require a disposable PostgreSQL database and should never target production.

Manual two-browser checklist:

1. Enter only a display name, create a room, and verify a unique readable URL is generated.
2. Preview devices only after clicking the media button; switch camera/microphone/output where supported.
3. Join from an isolated browser profile using only a display name.
4. Confirm presence, two-way audio/video, local muted preview, mute/camera toggles, and device replacement.
5. Draw simultaneously, add text/shapes, move an object, verify remote previews/cursors and user-local undo.
6. Pan/zoom independently, refresh each side, and confirm the board returns.
7. Open a third isolated profile and confirm capacity rejection.
8. Disconnect a network briefly and reconnect within 30 seconds; confirm the slot/session is retained.
9. Confirm host-only clear and room end. Check keyboard focus, Persian RTL, English, phone portrait/landscape.
10. Repeat with peers on different networks. In WebRTC internals confirm the selected ICE pair; force relay with browser policy or temporarily remove direct paths.

Test denied permissions, missing devices, a busy camera, offline Socket.IO, TURN stopped, PostgreSQL stopped, oversized updates, and mobile autoplay. Logs should show safe categories/request IDs without secrets, SDP, invitation URLs, or board text.
