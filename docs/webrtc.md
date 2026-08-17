# WebRTC

The React hook owns exactly one `RTCPeerConnection`. Local tracks are added once or replace matching senders. The perfect-negotiation pattern assigns politeness deterministically by participant ID, detects offer collisions, and lets only the polite peer roll through a collision. ICE candidates trickle over authenticated Socket.IO. Failed ICE triggers restart; browser `online` transitions also request renegotiation.

Media permissions are requested only by the preview/start-media button. The local video is muted and both videos use `playsInline`. Device changes replace the corresponding track without rebuilding the connection. Autoplay failure exposes a play control. Leaving stops tracks and closes the peer connection.

The authenticated TURN endpoint creates a username of `expiry:participant-id` and an HMAC-SHA1 coturn shared-secret credential. The browser never receives a static secret. A public STUN fallback is used only when TURN is not configured. Production reliability requires coturn; test from two networks and inspect the selected pair for `relay` candidates.

WebRTC encrypts audio/video in transit. CallYou does not record it. A TURN relay forwards encrypted packets and does not decrypt or store the call.
