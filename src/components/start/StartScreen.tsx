import { documentTitle, isDirty } from '@/domain/document';
import { t } from '@/i18n';
import { newDocument, openDocument, openRecent } from '@/services/documentActions';
import { useStore } from '@/store';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function StartScreen() {
  const doc = useStore((s) => s.doc);
  const recents = useStore((s) => s.recents);
  const setScreen = useStore((s) => s.setScreen);
  const hasCurrent = doc.markdown.length > 0 || isDirty(doc);

  return (
    <main className="start">
      <header className="start-header">
        <h1>{t('appName')}</h1>
        <p>{t('start.tagline')}</p>
      </header>

      <div className="start-actions">
        {hasCurrent ? (
          <button
            type="button"
            className="start-card start-card-primary"
            onClick={() => setScreen('editor')}
          >
            <strong>{t('start.continue')}</strong>
            <span>{doc.fileName}</span>
            <span className="muted">{documentTitle(doc.markdown)}</span>
          </button>
        ) : null}
        <button type="button" className="start-card" onClick={() => void newDocument()}>
          <strong>{t('start.new')}</strong>
        </button>
        <button type="button" className="start-card" onClick={() => void openDocument()}>
          <strong>{t('start.open')}</strong>
        </button>
      </div>

      <section className="start-recent" aria-labelledby="recent-heading">
        <h2 id="recent-heading">{t('start.recent')}</h2>
        {recents.length === 0 ? (
          <p className="muted">{t('start.noRecent')}</p>
        ) : (
          <ul>
            {recents.map((entry) => (
              <li key={entry.fileName}>
                <button
                  type="button"
                  className="recent-item"
                  onClick={() => void openRecent(entry)}
                >
                  <span className="recent-name">{entry.fileName}</span>
                  <span className="muted">{entry.title}</span>
                  <span className="muted recent-time">
                    {entry.handleId ? t('start.recentOnDisk') : t('start.recentCopy')} ·{' '}
                    {timeFormat.format(entry.openedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted start-hint">{t('start.dropHint')}</p>
    </main>
  );
}
