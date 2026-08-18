# Testing

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Server business-logic tests cover session/capacity security; shared tests cover room/board validation. Browser tests exercise the default Persian shell. Integration tests require a disposable PostgreSQL database and should never target production.

Manual two-browser checklist:

1. Enter only a display name, create a room, and verify a unique readable URL is generated.
2. Stop at the pre-join lobby, preview devices only after clicking the media button, and switch camera/microphone/output where supported. Also verify entering without media.
3. Join from an isolated browser profile using only a display name.
4. Confirm presence, two-way audio/video, local muted preview, mute/camera toggles, and device replacement.
5. Draw simultaneously, add text/shapes through the modal, move an object, verify remote previews/cursors and user-local undo.
6. Import a bounded image and multi-page PDF, draw over each page, refresh both sides, and confirm the assets return.
7. Open a third isolated profile and confirm capacity rejection.
8. Disconnect a network briefly and reconnect within 30 seconds; confirm the slot/session is retained.
9. Exchange chat text, emoji, an image, and a small document; verify a late join does not receive prior ephemeral messages.
10. Confirm host-only clear through the modal and room end. Check keyboard focus, Persian RTL, English, phone portrait/landscape.
11. Repeat with peers on different networks. In WebRTC internals confirm the selected ICE pair; force relay with browser policy or temporarily remove direct paths.
12. Share a browser tab or screen, confirm the remote participant sees the presentation layout, stop from both the CallYou button and the browser-provided control, and verify the camera returns.
13. Verify the quality badge changes from unknown after connection and that a brief network interruption enters reconnecting state before recovering with ICE restart.
14. Request recording and test both decline and accept. On accept, verify both participants see the recording indicator, stopping downloads a playable WebM file, and no recording request/body reaches HTTP storage.

Test denied permissions, missing devices, a busy camera, offline Socket.IO, TURN stopped, PostgreSQL stopped, oversized updates, and mobile autoplay. Logs should show safe categories/request IDs without secrets, SDP, invitation URLs, or board text.
