import { useEffect, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Play, Settings } from 'lucide-react';
import type { CallYouSocket } from '../socket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useI18n } from '../i18n';
import { MediaSetup } from './MediaSetup';
import { stopMedia } from '../media';
export function CallPanel({
  socket,
  slug,
  participantId,
  peerId,
  onLeave,
}: {
  socket: CallYouSocket;
  slug: string;
  participantId: string;
  peerId?: string;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const call = useWebRTC(socket, slug, participantId, peerId);
  const [settings, setSettings] = useState(false);
  useEffect(() => () => stopMedia(), []);
  return (
    <aside className="call-panel" aria-label="Video call">
      <div className="videos">
        <div className="video-tile remote">
          <video ref={call.remoteVideo} autoPlay playsInline />
          {call.state !== 'connected' && (
            <span>
              {call.state === 'idle'
                ? t('guestWaiting')
                : t(call.state === 'failed' ? 'disconnected' : call.state)}
            </span>
          )}
          {call.autoplayBlocked && (
            <button onClick={() => void call.playRemote()} aria-label="Play remote media">
              <Play />
            </button>
          )}
        </div>
        <div className="video-tile local">
          <video ref={call.localVideo} autoPlay muted playsInline />
          <span>{t('noMedia')}</span>
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
        <button onClick={() => setSettings(!settings)} title={t('settings')}>
          <Settings />
        </button>
        <button className="danger" onClick={onLeave} title={t('leave')}>
          <PhoneOff />
        </button>
      </div>
    </aside>
  );
}
