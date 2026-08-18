import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Circle,
  Gauge,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Play,
  Settings,
  Square,
} from 'lucide-react';
import type { CallYouSocket } from '../socket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useI18n } from '../i18n';
import { MediaSetup } from './MediaSetup';
import { cancelScheduledMediaStop, scheduleMediaStop } from '../media';
import { Modal } from './Modal';
export function CallPanel({
  socket,
  slug,
  participantId,
  peerId,
  localName,
  peerName,
  onLeave,
  onNotice,
}: {
  socket: CallYouSocket;
  slug: string;
  participantId: string;
  peerId?: string;
  localName: string;
  peerName?: string | undefined;
  onLeave: () => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useI18n();
  const call = useWebRTC(socket, slug, participantId, peerId);
  const [settings, setSettings] = useState(false);
  const [incomingRecording, setIncomingRecording] = useState<{
    requestId: string;
    displayName: string;
  } | null>(null);
  const [pendingRecording, setPendingRecording] = useState<string | null>(null);
  const [remoteRecording, setRemoteRecording] = useState(false);
  const [remoteSharing, setRemoteSharing] = useState(false);
  const lastSharing = useRef(call.sharingScreen);
  useEffect(() => {
    cancelScheduledMediaStop();
    return scheduleMediaStop;
  }, []);
  useEffect(() => {
    const requested = (data: { requestId: string; displayName: string }) =>
      setIncomingRecording(data);
    const response = (data: { requestId: string; accepted: boolean }) => {
      if (data.requestId !== pendingRecording) return;
      setPendingRecording(null);
      if (!data.accepted) return onNotice(t('recordingDeclined'));
      void call
        .startRecording()
        .then(() => socket.emit('recording:status', { active: true }))
        .catch(() => onNotice(t('recordingFailed')));
    };
    const recordingStatus = ({ active }: { active: boolean }) => setRemoteRecording(active);
    const screenStatus = ({ active }: { active: boolean }) => setRemoteSharing(active);
    const joined = () => {
      if (call.sharingScreen) socket.emit('screen:status', { active: true });
    };
    const left = () => {
      setPendingRecording(null);
      setIncomingRecording(null);
      setRemoteRecording(false);
      setRemoteSharing(false);
    };
    socket.on('recording:requested', requested);
    socket.on('recording:response', response);
    socket.on('recording:status', recordingStatus);
    socket.on('screen:status', screenStatus);
    socket.on('participant:joined', joined);
    socket.on('participant:left', left);
    return () => {
      socket.off('recording:requested', requested);
      socket.off('recording:response', response);
      socket.off('recording:status', recordingStatus);
      socket.off('screen:status', screenStatus);
      socket.off('participant:joined', joined);
      socket.off('participant:left', left);
    };
  }, [call, onNotice, pendingRecording, socket, t]);
  useEffect(() => {
    if (lastSharing.current === call.sharingScreen) return;
    lastSharing.current = call.sharingScreen;
    socket.emit('screen:status', { active: call.sharingScreen });
  }, [call.sharingScreen, socket]);
  useEffect(() => {
    if (!pendingRecording) return;
    const timeout = window.setTimeout(() => {
      setPendingRecording(null);
      onNotice(t('recordingTimedOut'));
    }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [onNotice, pendingRecording, t]);
  async function toggleScreen() {
    try {
      if (call.sharingScreen) await call.stopScreenShare();
      else await call.startScreenShare();
    } catch {
      onNotice(t('screenShareFailed'));
    }
  }
  function requestRecording() {
    if (call.state !== 'connected') return onNotice(t('recordingNeedsPeer'));
    const requestId = crypto.randomUUID();
    setPendingRecording(requestId);
    socket.emit('recording:request', { requestId });
  }
  function answerRecording(accepted: boolean) {
    if (!incomingRecording) return;
    socket.emit('recording:response', { requestId: incomingRecording.requestId, accepted });
    setIncomingRecording(null);
  }
  async function stopRecording() {
    try {
      if (await call.stopRecording()) socket.emit('recording:status', { active: false });
    } catch {
      onNotice(t('recordingFailed'));
    }
  }
  const qualityTitle = [
    call.quality.rttMs == null ? null : `${call.quality.rttMs} ms`,
    call.quality.packetLossPercent == null
      ? null
      : `${call.quality.packetLossPercent.toFixed(1)}% loss`,
    call.quality.route === 'unknown'
      ? null
      : t(call.quality.route === 'relay' ? 'relayConnection' : 'directConnection'),
  ]
    .filter(Boolean)
    .join(' · ');
  const qualityKey = {
    unknown: 'qualityUnknown',
    good: 'qualityGood',
    fair: 'qualityFair',
    poor: 'qualityPoor',
  }[call.quality.level] as 'qualityUnknown' | 'qualityGood' | 'qualityFair' | 'qualityPoor';
  return (
    <aside
      className={`call-panel ${remoteSharing ? 'presentation-active' : ''}`}
      aria-label="Video call"
    >
      {(call.recording || remoteRecording) && (
        <div className="recording-banner">
          <span />
          {t('recordingActive')}
        </div>
      )}
      {pendingRecording && <div className="consent-waiting">{t('recordingWaiting')}</div>}
      <div className="videos">
        <div className={`video-tile remote ${remoteSharing ? 'shared-screen' : ''}`}>
          <video ref={call.remoteVideo} autoPlay playsInline />
          {call.state !== 'connected' && (
            <span className="video-placeholder">
              {call.state === 'idle'
                ? t('guestWaiting')
                : t(call.state === 'failed' ? 'disconnected' : call.state)}
            </span>
          )}
          <strong className="video-name">{peerName ?? t('remoteVideo')}</strong>
          {remoteSharing && <span className="media-badge">{t('sharedScreen')}</span>}
          {call.autoplayBlocked && (
            <button onClick={() => void call.playRemote()} aria-label="Play remote media">
              <Play />
            </button>
          )}
        </div>
        <div className={`video-tile local ${call.sharingScreen ? 'shared-screen' : ''}`}>
          <video ref={call.localVideo} autoPlay muted playsInline />
          <span className="video-placeholder">{t('noMedia')}</span>
          <strong className="video-name">{localName || t('localVideo')}</strong>
          {call.sharingScreen && <span className="media-badge">{t('sharingScreen')}</span>}
        </div>
      </div>
      <div className={`connection ${call.state}`}>
        {t(
          call.state === 'idle'
            ? 'guestWaiting'
            : call.state === 'failed'
              ? 'disconnected'
              : call.state,
        )}
        <span className={`quality ${call.quality.level}`} title={qualityTitle}>
          <Gauge /> {t(qualityKey)}
        </span>
      </div>
      {settings && <MediaSetup />}
      <div className="call-controls">
        <button onClick={() => void call.startMedia()} title={t('camera')}>
          <Camera />
        </button>
        <button onClick={call.toggleMute} title={t('microphone')}>
          {call.muted ? <MicOff /> : <Mic />}
        </button>
        <button onClick={call.toggleCamera} title={t('camera')}>
          {call.cameraOff ? <CameraOff /> : <Camera />}
        </button>
        <button
          disabled={call.recording}
          onClick={() => setSettings(!settings)}
          title={t('settings')}
        >
          <Settings />
        </button>
        <button
          className={call.sharingScreen ? 'active-control' : ''}
          onClick={() => void toggleScreen()}
          title={t(call.sharingScreen ? 'stopScreenShare' : 'shareScreen')}
        >
          {call.sharingScreen ? <Square /> : <MonitorUp />}
        </button>
        <button
          className={call.recording ? 'recording-control' : ''}
          disabled={Boolean(pendingRecording)}
          onClick={() => void (call.recording ? stopRecording() : requestRecording())}
          title={t(
            call.recording ? 'stopRecording' : pendingRecording ? 'recordingWaiting' : 'recordCall',
          )}
        >
          {call.recording ? <Square /> : <Circle />}
        </button>
        <button
          className="danger"
          onClick={() => {
            if (call.sharingScreen) socket.emit('screen:status', { active: false });
            if (call.recording) socket.emit('recording:status', { active: false });
            call.stop();
            onLeave();
          }}
          title={t('leave')}
        >
          <PhoneOff />
        </button>
      </div>
      {incomingRecording && (
        <Modal
          title={t('recordingRequestTitle')}
          onClose={() => answerRecording(false)}
          actions={
            <>
              <button className="secondary" onClick={() => answerRecording(false)}>
                {t('decline')}
              </button>
              <button className="primary" onClick={() => answerRecording(true)}>
                {t('allowRecording')}
              </button>
            </>
          }
        >
          <p className="confirm-message">
            {t('recordingRequestMessage').replace('{name}', incomingRecording.displayName)}
          </p>
        </Modal>
      )}
    </aside>
  );
}
