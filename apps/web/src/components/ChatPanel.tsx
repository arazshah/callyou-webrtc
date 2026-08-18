import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, FilePlus2, MessageCircle, Send, Smile, X } from 'lucide-react';
import { LIMITS, type ChatMessage } from '@callyou/shared';
import type { CallYouSocket } from '../socket';
import { useI18n } from '../i18n';

type ChatAttachment = NonNullable<ChatMessage['attachment']>;

const emojis = ['😀', '😊', '😂', '😍', '👍', '👏', '❤️', '🎉', '🤝', '🙏'];
const allowedTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ChatPanel({
  socket,
  participantId,
  onError,
}: {
  socket: CallYouSocket;
  participantId: string;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const receive = (message: ChatMessage) => {
      setMessages((current) => [...current.slice(-99), message]);
      if (!open && message.participantId !== participantId) setUnread((value) => value + 1);
    };
    socket.on('chat:message', receive);
    return () => {
      socket.off('chat:message', receive);
    };
  }, [open, participantId, socket]);
  useEffect(() => {
    if (open) {
      setUnread(0);
      end.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [messages, open]);

  function send(payload: { text?: string; attachment?: ChatMessage['attachment'] }) {
    setBusy(true);
    socket.emit('chat:send', { id: crypto.randomUUID(), ...payload }, (result) => {
      setBusy(false);
      if (!result.ok) onError(t('chatSendFailed'));
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.current?.value.trim();
    if (!value) return;
    send({ text: value.slice(0, LIMITS.chatText) });
    if (input.current) input.current.value = '';
    setEmojiOpen(false);
  }
  async function attach(file: File | undefined) {
    if (!file) return;
    if (file.size > LIMITS.chatFileBytes) return onError(t('chatFileTooLarge'));
    if (!allowedTypes.has(file.type)) return onError(t('unsupportedFile'));
    try {
      setBusy(true);
      const data = await readDataUrl(file);
      send({
        attachment: {
          name: file.name.slice(0, 120),
          type: file.type as ChatAttachment['type'],
          size: file.size,
          data,
        },
      });
    } catch {
      setBusy(false);
      onError(t('chatSendFailed'));
    }
  }
  return (
    <div className={`chat-widget ${open ? 'open' : ''}`}>
      {open && (
        <section className="chat-panel" aria-label={t('chat')}>
          <header>
            <div>
              <MessageCircle />
              <strong>{t('chat')}</strong>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label={t('close')}>
              <X />
            </button>
          </header>
          <div className="chat-messages" aria-live="polite">
            {!messages.length && <p className="empty-chat">{t('emptyChat')}</p>}
            {messages.map((message) => {
              const own = message.participantId === participantId;
              return (
                <article className={`chat-message ${own ? 'own' : ''}`} key={message.id}>
                  <div className="chat-meta">
                    <span style={{ color: message.color }}>
                      {own ? t('you') : message.displayName}
                    </span>
                    <time>
                      {new Date(message.sentAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  {message.text && <p>{message.text}</p>}
                  {message.attachment && (
                    <a
                      className="chat-file"
                      href={message.attachment.data}
                      download={message.attachment.name}
                    >
                      {message.attachment.type.startsWith('image/') && (
                        <img src={message.attachment.data} alt="" />
                      )}
                      <span>{message.attachment.name}</span>
                      <Download />
                    </a>
                  )}
                </article>
              );
            })}
            <div ref={end} />
          </div>
          {emojiOpen && (
            <div className="emoji-picker">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    if (input.current) input.current.value += emoji;
                    input.current?.focus();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <form className="chat-compose" onSubmit={submit}>
            <button
              type="button"
              onClick={() => setEmojiOpen((value) => !value)}
              title={t('addEmoji')}
            >
              <Smile />
            </button>
            <label title={t('attachFile')}>
              <FilePlus2 />
              <input
                type="file"
                accept={[...allowedTypes].join(',')}
                onChange={(event) => {
                  void attach(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <input ref={input} maxLength={LIMITS.chatText} placeholder={t('typeMessage')} />
            <button className="send-button" disabled={busy} title={t('send')}>
              <Send />
            </button>
          </form>
        </section>
      )}
      <button
        className="chat-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('chat')}
        aria-expanded={open}
      >
        {open ? <X /> : <MessageCircle />}
        {unread > 0 && <span>{Math.min(unread, 9)}</span>}
      </button>
    </div>
  );
}
