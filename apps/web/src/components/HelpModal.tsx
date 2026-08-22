import {
  ImagePlus,
  Layers3,
  Link2,
  MessageCircle,
  MonitorUp,
  MousePointer2,
  Video,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { Modal } from './Modal';

export function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const steps = [
    { icon: Link2, title: t('guide1Title'), body: t('guide1Body') },
    { icon: Video, title: t('guide2Title'), body: t('guide2Body') },
    { icon: MousePointer2, title: t('guide3Title'), body: t('guide3Body') },
    { icon: Layers3, title: t('guide7Title'), body: t('guide7Body') },
    { icon: ImagePlus, title: t('guide4Title'), body: t('guide4Body') },
    { icon: MessageCircle, title: t('guide5Title'), body: t('guide5Body') },
    { icon: MonitorUp, title: t('guide6Title'), body: t('guide6Body') },
  ];
  return (
    <Modal
      title={t('guideTitle')}
      onClose={onClose}
      className="help-modal"
      actions={
        <button className="primary" onClick={onClose}>
          {t('gotIt')}
        </button>
      }
    >
      <p className="guide-intro">{t('guideIntro')}</p>
      <div className="guide-grid">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <article className="guide-step" key={title}>
            <span className="guide-number">{String(index + 1).padStart(2, '0')}</span>
            <Icon />
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="guide-shortcuts">
        <kbd>P</kbd> {t('pen')} · <kbd>V</kbd> {t('select')} · <kbd>T</kbd> {t('text')} ·{' '}
        <kbd>Ctrl Z</kbd> {t('undo')}
      </div>
    </Modal>
  );
}
