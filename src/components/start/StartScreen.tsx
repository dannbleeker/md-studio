import { useShallow } from 'zustand/react/shallow';
import { documentTitle } from '@/domain/document';
import { isBlank } from '@/domain/tabs';
import { dateTimeFormat, t } from '@/i18n';
import {
  clearRecents,
  forgetRecent,
  newDocument,
  openDocument,
  openRecent,
  openWelcome,
  switchTab,
} from '@/services/documentActions';
import { BOOK_EPUB, BOOK_PDF, DASHBOARD } from '@/services/links';
import { syncedTabs, useStore } from '@/store';

export function StartScreen() {
  const recents = useStore((s) => s.recents);
  // The tab to continue: the active one, or, when that is an untouched new
  // document, the first tab that holds work (it would be unreachable
  // otherwise: the tab bar isn't shown on the start screen).
  const [resumeId, resumeName, resumeMarkdown] = useStore(
    useShallow((s) => {
      const tabs = syncedTabs(s);
      const active = tabs.find((tab) => tab.id === s.activeTabId);
      const tab = active && !isBlank(active) ? active : tabs.find((other) => !isBlank(other));
      return tab ? [tab.id, tab.doc.fileName, tab.doc.markdown] : [null, '', ''];
    })
  );
  const timeFormat = dateTimeFormat({ dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="start">
      <header className="start-header">
        <h1>{t('appName')}</h1>
        <p>{t('start.tagline')}</p>
      </header>

      <div className="start-actions">
        {resumeId ? (
          <button
            type="button"
            className="start-card start-card-primary"
            onClick={() => void switchTab(resumeId)}
          >
            <strong>{t('start.continue')}</strong>
            <span>{resumeName}</span>
            <span className="muted">{documentTitle(resumeMarkdown)}</span>
          </button>
        ) : null}
        <button type="button" className="start-card" onClick={() => void newDocument()}>
          <strong>{t('start.new')}</strong>
        </button>
        <button type="button" className="start-card" onClick={() => void openDocument()}>
          <strong>{t('start.open')}</strong>
        </button>
        <button type="button" className="start-card" onClick={() => void openWelcome()}>
          <strong>{t('start.welcome')}</strong>
        </button>
      </div>

      <section className="start-recent" aria-labelledby="recent-heading">
        <div className="start-recent-head">
          <h2 id="recent-heading">{t('start.recent')}</h2>
          {recents.length > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => void clearRecents()}>
              {t('start.clearRecents')}
            </button>
          ) : null}
        </div>
        {recents.length === 0 ? (
          <p className="muted">{t('start.noRecent')}</p>
        ) : (
          <ul>
            {recents.map((entry) => (
              <li key={entry.handleId ?? entry.fileName} className="recent-row">
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
                <button
                  type="button"
                  className="recent-remove"
                  aria-label={t('start.removeRecent', { name: entry.fileName })}
                  title={t('start.removeRecent', { name: entry.fileName })}
                  onClick={() => forgetRecent(entry)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted start-hint">{t('start.dropHint')}</p>
      <nav className="start-links" aria-label={t('start.links')}>
        <a href={BOOK_PDF} target="_blank" rel="noopener">
          {t('start.bookPdf')}
        </a>
        <a href={BOOK_EPUB} download>
          {t('start.bookEpub')}
        </a>
        <a href={DASHBOARD} target="_blank" rel="noopener">
          {t('start.dashboard')}
        </a>
      </nav>
    </main>
  );
}
