import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, Volume2 } from 'lucide-react';
import { currentMedia, replaceDevice, requestMedia } from '../media';
import { useI18n } from '../i18n';
type Device = MediaDeviceInfo;
export function MediaSetup() {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(Boolean(currentMedia()));
  async function refresh() {
    if (!navigator.mediaDevices) return;
    setDevices(await navigator.mediaDevices.enumerateDevices());
  }
  async function start() {
    try {
      const s = await requestMedia();
      setStarted(true);
      setError('');
      if (video.current) video.current.srcObject = s;
      await refresh();
    } catch {
      setError(t('deviceError'));
    }
  }
  useEffect(() => {
    if (video.current) video.current.srcObject = currentMedia();
    const listener = () => void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', listener);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', listener);
  }, [started]);
  async function change(kind: 'videoinput' | 'audioinput', id: string) {
    try {
      const s = await replaceDevice(kind, id);
      if (video.current) video.current.srcObject = s;
      await refresh();
    } catch {
      setError(t('deviceError'));
    }
  }
  async function output(id: string) {
    const element = video.current as
      (HTMLVideoElement & { setSinkId?: (v: string) => Promise<void> }) | null;
    await element?.setSinkId?.(id);
  }
  return (
    <section className="media-setup">
      <div className="preview">
        <video ref={video} autoPlay muted playsInline />
        {!started && <Camera aria-hidden="true" />}
      </div>
      {!started ? (
        <>
          <button className="secondary wide" type="button" onClick={start}>
            {t('startPreview')}
          </button>
          <small>{t('previewHint')}</small>
        </>
      ) : (
        <div className="device-grid">
          <label>
            <Camera />
            <select
              aria-label={t('camera')}
              onChange={(e) => void change('videoinput', e.target.value)}
            >
              {devices
                .filter((d) => d.kind === 'videoinput')
                .map((d) => (
                  <option value={d.deviceId} key={d.deviceId}>
                    {d.label || t('camera')}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <Mic />
            <select
              aria-label={t('microphone')}
              onChange={(e) => void change('audioinput', e.target.value)}
            >
              {devices
                .filter((d) => d.kind === 'audioinput')
                .map((d) => (
                  <option value={d.deviceId} key={d.deviceId}>
                    {d.label || t('microphone')}
                  </option>
                ))}
            </select>
          </label>
          {'setSinkId' in HTMLMediaElement.prototype && (
            <label>
              <Volume2 />
              <select aria-label={t('output')} onChange={(e) => void output(e.target.value)}>
                {devices
                  .filter((d) => d.kind === 'audiooutput')
                  .map((d) => (
                    <option value={d.deviceId} key={d.deviceId}>
                      {d.label || t('output')}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
