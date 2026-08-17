import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallYouSocket } from '../socket';
import { api } from '../api';
import { currentMedia, requestMedia, stopMedia } from '../media';
export type CallState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
export function useWebRTC(
  socket: CallYouSocket | null,
  slug: string,
  participantId: string,
  initialPeerId?: string,
) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const peerId = useRef(initialPeerId);
  const attachLocal = useCallback((pc: RTCPeerConnection) => {
    const media = currentMedia();
    if (localVideo.current) localVideo.current.srcObject = media;
    for (const track of media?.getTracks() ?? []) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) void sender.replaceTrack(track);
      else pc.addTrack(track, media!);
    }
  }, []);
  const ensurePeer = useCallback(
    async (id?: string) => {
      if (id) peerId.current = id;
      if (pcRef.current) return pcRef.current;
      const { iceServers } = await api.turn(slug);
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      setState('connecting');
      attachLocal(pc);
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        if (remoteVideo.current) {
          remoteVideo.current.srcObject = stream;
          void remoteVideo.current
            .play()
            .then(() => setAutoplayBlocked(false))
            .catch(() => setAutoplayBlocked(true));
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate)
          socket?.emit('webrtc:ice-candidate', {
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          });
      };
      pc.onconnectionstatechange = () => {
        setState(
          pc.connectionState === 'connected'
            ? 'connected'
            : pc.connectionState === 'failed'
              ? 'failed'
              : pc.connectionState === 'disconnected'
                ? 'disconnected'
                : 'connecting',
        );
        if (pc.connectionState === 'failed') {
          pc.restartIce();
          socket?.emit('webrtc:restart-ice');
        }
      };
      pc.onnegotiationneeded = async () => {
        try {
          makingOffer.current = true;
          await pc.setLocalDescription();
          if (pc.localDescription?.type === 'offer')
            socket?.emit('webrtc:offer', {
              description: { type: 'offer', sdp: pc.localDescription.sdp ?? '' },
            });
        } finally {
          makingOffer.current = false;
        }
      };
      return pc;
    },
    [attachLocal, slug, socket],
  );
  useEffect(() => {
    if (!socket) return;
    const onJoined = ({ participantId: id }: { participantId: string }) => void ensurePeer(id);
    const onLeft = () => {
      pcRef.current?.close();
      pcRef.current = null;
      setState('disconnected');
    };
    const onOffer = async ({ description }: { description: RTCSessionDescriptionInit }) => {
      const pc = await ensurePeer();
      const polite = participantId.localeCompare(peerId.current ?? '') > 0;
      const collision = makingOffer.current || pc.signalingState !== 'stable';
      ignoreOffer.current = !polite && collision;
      if (ignoreOffer.current) return;
      await pc.setRemoteDescription(description);
      await pc.setLocalDescription();
      if (pc.localDescription?.type === 'answer')
        socket.emit('webrtc:answer', {
          description: { type: 'answer', sdp: pc.localDescription.sdp ?? '' },
        });
    };
    const onAnswer = async ({ description }: { description: RTCSessionDescriptionInit }) => {
      const pc = await ensurePeer();
      if (pc.signalingState !== 'stable') await pc.setRemoteDescription(description);
    };
    const onIce = async ({
      candidate,
    }: {
      candidate: {
        candidate: string;
        sdpMid?: string | null | undefined;
        sdpMLineIndex?: number | null | undefined;
        usernameFragment?: string | null | undefined;
      };
    }) => {
      try {
        const init: RTCIceCandidateInit = { candidate: candidate.candidate };
        if (candidate.sdpMid !== undefined) init.sdpMid = candidate.sdpMid;
        if (candidate.sdpMLineIndex !== undefined) init.sdpMLineIndex = candidate.sdpMLineIndex;
        if (candidate.usernameFragment !== undefined)
          init.usernameFragment = candidate.usernameFragment;
        await (await ensurePeer()).addIceCandidate(init);
      } catch (error) {
        if (!ignoreOffer.current) console.error('ICE candidate failed', error);
      }
    };
    const onRestart = () => {
      const pc = pcRef.current;
      if (pc) {
        pc.restartIce();
        void pc.setLocalDescription().then(() => {
          if (pc.localDescription?.type === 'offer')
            socket.emit('webrtc:offer', {
              description: { type: 'offer', sdp: pc.localDescription.sdp ?? '' },
            });
        });
      }
    };
    socket.on('participant:joined', onJoined);
    socket.on('participant:left', onLeft);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onIce);
    socket.on('webrtc:restart-ice', onRestart);
    if (initialPeerId) void ensurePeer(initialPeerId);
    const network = () => {
      if (pcRef.current?.connectionState === 'connected') onRestart();
    };
    const mediaChanged = () => {
      if (localVideo.current) localVideo.current.srcObject = currentMedia();
      if (pcRef.current) attachLocal(pcRef.current);
    };
    window.addEventListener('online', network);
    window.addEventListener('callyou:media-changed', mediaChanged);
    mediaChanged();
    return () => {
      socket.off('participant:joined', onJoined);
      socket.off('participant:left', onLeft);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onIce);
      socket.off('webrtc:restart-ice', onRestart);
      window.removeEventListener('online', network);
      window.removeEventListener('callyou:media-changed', mediaChanged);
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [attachLocal, ensurePeer, initialPeerId, participantId, socket]);
  const startMedia = useCallback(async () => {
    const media = currentMedia() ?? (await requestMedia());
    if (localVideo.current) localVideo.current.srcObject = media;
    if (pcRef.current) attachLocal(pcRef.current);
    return media;
  }, [attachLocal]);
  const toggleMute = () => {
    const track = currentMedia()?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  };
  const toggleCamera = () => {
    const track = currentMedia()?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOff(!track.enabled);
    }
  };
  const stop = () => {
    pcRef.current?.close();
    pcRef.current = null;
    stopMedia();
  };
  return {
    remoteVideo,
    localVideo,
    state,
    muted,
    cameraOff,
    autoplayBlocked,
    startMedia,
    toggleMute,
    toggleCamera,
    stop,
    playRemote: () => remoteVideo.current?.play().then(() => setAutoplayBlocked(false)),
  };
}
