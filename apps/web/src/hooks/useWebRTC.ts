import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallYouSocket } from '../socket';
import { api } from '../api';
import { currentMedia, requestMedia, stopMedia } from '../media';
import { EMPTY_CALL_QUALITY, readCallQuality, type CallQuality } from '../callQuality';
import { downloadRecording, startCallRecording, type CallRecording } from '../recording';
export type CallState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';
export function useWebRTC(
  socket: CallYouSocket | null,
  slug: string,
  participantId: string,
  initialPeerId?: string,
) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<CallRecording | null>(null);
  const restartTimer = useRef<number | null>(null);
  const restartAttempts = useRef(0);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [quality, setQuality] = useState<CallQuality>(EMPTY_CALL_QUALITY);
  const peerId = useRef(initialPeerId);
  const attachLocal = useCallback((pc: RTCPeerConnection) => {
    const media = currentMedia();
    const screen = screenStreamRef.current;
    if (localVideo.current) localVideo.current.srcObject = screen ?? media;
    const tracks = [
      media?.getAudioTracks()[0],
      screen?.getVideoTracks()[0] ?? media?.getVideoTracks()[0],
    ].filter((track): track is MediaStreamTrack => Boolean(track));
    for (const track of tracks) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) void sender.replaceTrack(track);
      else pc.addTrack(track, track.kind === 'video' && screen ? screen : media!);
    }
  }, []);
  const clearRestartTimer = useCallback(() => {
    if (restartTimer.current != null) window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
  }, []);
  const finishRecording = useCallback(async () => {
    const active = recordingRef.current;
    if (!active) return false;
    recordingRef.current = null;
    const blob = await active.stop();
    downloadRecording(blob, slug);
    setRecording(false);
    return true;
  }, [slug]);
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
        if (pc.connectionState === 'connected') {
          clearRestartTimer();
          restartAttempts.current = 0;
          setState('connected');
        } else if (pc.connectionState === 'disconnected') {
          setState('reconnecting');
          clearRestartTimer();
          restartTimer.current = window.setTimeout(() => {
            if (pc.connectionState !== 'connected') {
              restartAttempts.current += 1;
              pc.restartIce();
              socket?.emit('webrtc:restart-ice');
            }
          }, 2500);
        } else if (pc.connectionState === 'failed') {
          setState(restartAttempts.current >= 3 ? 'failed' : 'reconnecting');
          if (restartAttempts.current < 3) {
            restartAttempts.current += 1;
            pc.restartIce();
            socket?.emit('webrtc:restart-ice');
          }
        } else if (pc.connectionState === 'closed') {
          setState('disconnected');
        } else {
          setState('connecting');
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
    [attachLocal, clearRestartTimer, slug, socket],
  );
  useEffect(() => {
    if (!socket) return;
    const onJoined = ({ participantId: id }: { participantId: string }) => void ensurePeer(id);
    const onLeft = () => {
      clearRestartTimer();
      if (recordingRef.current) void finishRecording();
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
      clearRestartTimer();
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (recordingRef.current) void finishRecording();
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [
    attachLocal,
    clearRestartTimer,
    ensurePeer,
    finishRecording,
    initialPeerId,
    participantId,
    socket,
  ]);
  useEffect(() => {
    if (state !== 'connected' || !pcRef.current) {
      if (state !== 'reconnecting') setQuality(EMPTY_CALL_QUALITY);
      return;
    }
    let active = true;
    const update = async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const next = await readCallQuality(pc);
        if (active) setQuality(next);
      } catch {
        if (active) setQuality(EMPTY_CALL_QUALITY);
      }
    };
    void update();
    const interval = window.setInterval(() => void update(), 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [state]);
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
  const stopScreenShare = useCallback(async () => {
    const screen = screenStreamRef.current;
    if (!screen) return;
    screenStreamRef.current = null;
    screen.getTracks().forEach((track) => track.stop());
    const camera = currentMedia()?.getVideoTracks()[0] ?? null;
    const sender = pcRef.current?.getSenders().find((item) => item.track?.kind === 'video');
    if (sender) await sender.replaceTrack(camera);
    if (localVideo.current) localVideo.current.srcObject = currentMedia();
    setSharingScreen(false);
  }, []);
  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('screen_share_not_supported');
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: false,
    });
    await stopScreenShare();
    screenStreamRef.current = screen;
    const track = screen.getVideoTracks()[0];
    if (!track) throw new Error('screen_share_unavailable');
    track.addEventListener('ended', () => void stopScreenShare(), { once: true });
    try {
      const pc = pcRef.current;
      const sender = pc?.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      else if (pc) pc.addTrack(track, screen);
      if (localVideo.current) localVideo.current.srcObject = screen;
      setSharingScreen(true);
    } catch (error) {
      screenStreamRef.current = null;
      screen.getTracks().forEach((item) => item.stop());
      if (localVideo.current) localVideo.current.srcObject = currentMedia();
      throw error;
    }
  }, [stopScreenShare]);
  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    const localElement = localVideo.current;
    const remoteElement = remoteVideo.current;
    const remote = remoteElement?.srcObject;
    if (!localElement || !remoteElement || !(remote instanceof MediaStream))
      throw new Error('remote_media_unavailable');
    recordingRef.current = await startCallRecording({
      localVideo: localElement,
      remoteVideo: remoteElement,
      localAudio: currentMedia(),
      remoteAudio: remote,
    });
    setRecording(true);
  }, []);
  const stop = () => {
    if (recordingRef.current) void finishRecording();
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setSharingScreen(false);
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
    sharingScreen,
    recording,
    quality,
    startMedia,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording: finishRecording,
    stop,
    playRemote: () => remoteVideo.current?.play().then(() => setAutoplayBlocked(false)),
  };
}
