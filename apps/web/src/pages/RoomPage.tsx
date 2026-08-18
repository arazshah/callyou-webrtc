import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, CircleHelp, Copy, LogOut, Power, ShieldX, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import { connectSocket, type CallYouSocket } from '../socket';
import { useI18n } from '../i18n';
import { Whiteboard } from '../components/Whiteboard';
import { CallPanel } from '../components/CallPanel';
import { ConfirmDialog } from '../components/Modal';
import { HelpModal } from '../components/HelpModal';
import { ChatPanel } from '../components/ChatPanel';
import { PreJoin } from '../components/PreJoin';
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
  const [status, setStatus] = useState<'loading' | 'join' | 'prejoin' | 'room' | 'ended' | 'error'>(
    'loading',
  );
  const [prejoinName, setPrejoinName] = useState('');
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<'clear' | 'end' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const socket = useMemo<CallYouSocket>(() => connectSocket(), []);
  useEffect(() => {
    let alive = true;
    void api
      .status(slug)
      .then((s) => {
        if (alive) {
          if (s.authenticated) {
            setPrejoinName(s.displayName ?? '');
            setStatus('prejoin');
          } else setStatus('join');
        }
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
      const displayName = String(data.displayName ?? '').trim();
      await api.joinRoom(slug, { displayName });
      setPrejoinName(displayName);
      setStatus('prejoin');
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'room_full' ? t('roomFull') : t('unavailable'));
    }
  }
  async function leave() {
    await api.leave(slug).catch(() => undefined);
    socket.disconnect();
    navigate('/');
  }
  async function confirmAction() {
    if (!confirming) return;
    setActionBusy(true);
    try {
      if (confirming === 'end') {
        await api.end(slug);
        setStatus('ended');
      } else await api.clear(slug);
      setConfirming(null);
    } catch {
      setError(confirming === 'clear' ? t('clearFailed') : t('unavailable'));
    } finally {
      setActionBusy(false);
    }
  }
  function notify(message: string) {
    setError(message);
    window.setTimeout(() => setError((current) => (current === message ? '' : current)), 3600);
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
  if (status === 'prejoin')
    return (
      <main className="prejoin-page" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <header className="topbar">
          <a className="brand" href="/">
            <span>Call</span>You
          </a>
          <button className="language" onClick={toggle}>
            {t('language')}
          </button>
        </header>
        <PreJoin displayName={prejoinName} onEnter={() => setStatus('room')} />
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
            <>
              <button className="danger-text" onClick={() => setConfirming('clear')}>
                <Trash2 />
                <span>{t('clearBoard')}</span>
              </button>
              <button className="danger-text" onClick={() => setConfirming('end')}>
                <Power />
                <span>{t('end')}</span>
              </button>
            </>
          )}
          <button onClick={() => setHelp(true)} title={t('help')}>
            <CircleHelp />
            <span>{t('help')}</span>
          </button>
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
              onClear={() => setConfirming('clear')}
              onNotice={notify}
            />
            <CallPanel
              socket={socket}
              slug={slug}
              participantId={identity.participantId}
              {...peerProps}
              localName={identity.displayName}
              peerName={identity.peers[0]?.displayName}
              onLeave={() => void leave()}
              onNotice={notify}
            />
            <ChatPanel socket={socket} participantId={identity.participantId} onError={notify} />
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
      {confirming && (
        <ConfirmDialog
          title={t(confirming === 'clear' ? 'clearBoardTitle' : 'endRoomTitle')}
          message={t(confirming === 'clear' ? 'clearConfirm' : 'endConfirm')}
          danger
          busy={actionBusy}
          onCancel={() => !actionBusy && setConfirming(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </main>
  );
}
