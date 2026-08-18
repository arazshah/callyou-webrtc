import { ArrowRight, Video } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../i18n';
import { currentMedia } from '../media';
import { MediaSetup } from './MediaSetup';

export function PreJoin({ displayName, onEnter }: { displayName: string; onEnter: () => void }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(Boolean(currentMedia()));
  return (
    <section className="prejoin-card card">
      <div className="prejoin-heading">
        <span className="prejoin-icon">
          <Video />
        </span>
        <div>
          <h1>{t('readyToJoin')}</h1>
          <p>{t('prejoinDescription')}</p>
        </div>
      </div>
      <MediaSetup onReady={setReady} />
      <div className="prejoin-footer">
        <span>{displayName}</span>
        <button className="primary" type="button" onClick={onEnter}>
          {ready ? t('enterRoom') : t('joinWithoutMedia')}
          <ArrowRight />
        </button>
      </div>
    </section>
  );
}
