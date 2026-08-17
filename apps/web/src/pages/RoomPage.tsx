import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, LogOut, ShieldX } from 'lucide-react';
import { api, ApiError } from '../api';
import { connectSocket, type CallYouSocket } from '../socket';
import { useI18n } from '../i18n';
import { Whiteboard } from '../components/Whiteboard';
import { CallPanel } from '../components/CallPanel';
import { requestMedia } from '../media';
type Identity = {
  participantId: string;
  role: 'host' | 'guest';
  displayName: string;
  color: string;
  peers: Array<{ participantId: string; displayName: string; color: string }>;
};
export function RoomPage() {
  const { slug = '' } = useParams();
  const { t, lang, toggle } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'join' | 'room' | 'ended' | 'error'>('loading');
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [copied, setCopied] = useState(false);
  const socket = useMemo<CallYouSocket>(() => connectSocket(), []);
  useEffect(() => {
    let alive = true;
    void api
      .status(slug)
      .then((s) => {
        if (alive) setStatus(s.authenticated ? 'room' : 'join');
      })
      .catch(() => alive && setStatus('join'));
    return () => {
      alive = false;
    };
  }, [slug]);
  useEffect(() => {
    if (status !== 'room') return;
    const join = () =>
      socket.emit('room:join', { slug }, (result) => {
        if (!result.ok) setStatus(result.code === 'room_ended' ? 'ended' : 'join');
      });
    const joined = (data: Identity) => setIdentity(data);
    const ended = () => setStatus('ended');
    socket.on('connect', join);
    socket.on('room:joined', joined);
    socket.on('room:ended', ended);
    if (socket.connected) join();
    else socket.connect();
    return () => {
      socket.off('connect', join);
      socket.off('room:joined', joined);
      socket.off('room:ended', ended);
    };
  }, [slug, socket, status]);
  useEffect(
    () => () => {
      socket.disconnect();
    },
    [socket],
  );
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      void requestMedia().catch(() => null);
      await api.joinRoom(slug, { displayName: data.displayName });
      setStatus('room');
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'room_full' ? t('roomFull') : t('unavailable'));
    }
  }
  async function leave() {
    await api.leave(slug).catch(() => undefined);
    socket.disconnect();
    navigate('/');
  }
  async function end() {
    if (!confirm(t('endConfirm'))) return;
    await api.end(slug);
    setStatus('ended');
  }
  async function clear() {
    if (confirm(t('clearConfirm'))) await api.clear(slug);
  }
  async function copy() {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  if (status === 'loading')
    return (
      <main className="center-page">
        <div className="loader" />
        <p>{t('connecting')}</p>
      </main>
    );
  if (status === 'ended')
    return (
      <main className="center-page">
        <ShieldX size={52} />
        <h1>{t('ended')}</h1>
        <a href="/" className="primary">
          {t('createRoom')}
        </a>
      </main>
    );
  if (status === 'join')
    return (
      <main className="join-page" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <header className="topbar">
          <a className="brand" href="/">
            <span>Call</span>You
          </a>
          <button className="language" onClick={toggle}>
            {t('language')}
          </button>
        </header>
        <div className="join-layout">
          <section>
            <span className="room-label">callyou.ir/{slug}</span>
            <h1>{t('joinRoom')}</h1>
          </section>
          <form className="card join-form" onSubmit={join}>
            <label>
              {t('yourName')}
              <input name="displayName" required maxLength={40} autoComplete="name" />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary">{t('join')}</button>
          </form>
        </div>
      </main>
    );
  const peerProps = identity?.peers[0] ? { peerId: identity.peers[0].participantId } : {};
  return (
    <main className="room-page" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <header className="room-header">
        <a className="brand compact" href="/">
          <span>Call</span>You
        </a>
        <div className="room-title">
          <strong>{slug}</strong>
          <span>{identity?.role === 'host' ? 'Host' : 'Guest'}</span>
        </div>
        <div className="room-actions">
          <button onClick={copy}>
            {copied ? <Check /> : <Copy />}
            <span>{copied ? t('copied') : t('copyLink')}</span>
          </button>
          <button className="language" onClick={toggle}>
            {t('language')}
          </button>
          {identity?.role === 'host' && (
            <button className="danger-text" onClick={() => void end()}>
              {t('end')}
            </button>
          )}
          <button onClick={() => void leave()} title={t('leave')}>
            <LogOut />
          </button>
        </div>
      </header>
      <div className="workspace">
        {identity ? (
          <>
            <Whiteboard
              socket={socket}
              participantId={identity.participantId}
              isHost={identity.role === 'host'}
              onClear={() => void clear()}
            />
            <CallPanel
              socket={socket}
              slug={slug}
              participantId={identity.participantId}
              {...peerProps}
              onLeave={() => void leave()}
            />
          </>
        ) : (
          <div className="workspace-loading">
            <div className="loader" />
            {t('connecting')}
          </div>
        )}
      </div>
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
