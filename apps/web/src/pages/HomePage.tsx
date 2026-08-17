import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { requestMedia } from '../media';
export function HomePage() {
  const { t, lang, toggle } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      void requestMedia().catch(() => null);
      const { slug } = await api.createRoom({ displayName: data.get('displayName') });
      navigate(`/${slug}`);
    } catch {
      setError(t('invalidInput'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="landing" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="CallYou home">
          <span>Call</span>You
        </a>
        <button className="language" onClick={toggle}>
          {t('language')}
        </button>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">callyou.ir</span>
          <h1>
            {lang === 'fa' ? 'گفت‌وگو کنید، با هم فکر کنید.' : 'Talk together. Think together.'}
          </h1>
          <p>
            {lang === 'fa'
              ? 'یک اتاق خصوصی دونفره برای تماس تصویری و تخته سفید مشترک—ساده، سریع و بدون حساب کاربری.'
              : 'A private two-person room for video calls and a shared whiteboard—simple, focused, no accounts.'}
          </p>
          <div className="board-sketch" aria-hidden="true">
            <svg viewBox="0 0 560 290">
              <path d="M48 210 C125 68 194 266 285 116 S430 76 507 194" />
              <circle cx="105" cy="88" r="34" />
              <rect x="341" y="164" width="104" height="62" rx="12" />
              <path d="M174 65h101m-51-34v68" />
            </svg>
          </div>
        </div>
        <form className="card create-form" onSubmit={submit}>
          <div>
            <span className="step">01</span>
            <h2>{t('createRoom')}</h2>
          </div>
          <label>
            {t('yourName')}
            <input name="displayName" required maxLength={40} autoComplete="name" />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? '…' : t('create')}
          </button>
          <p className="privacy-note">
            {lang === 'fa'
              ? 'تصویر و صدا ذخیره نمی‌شود. رسانه با WebRTC رمزگذاری می‌شود.'
              : 'Audio and video are never stored. Media is encrypted by WebRTC.'}
          </p>
        </form>
      </section>
    </main>
  );
}
