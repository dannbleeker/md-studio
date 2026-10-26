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
import { DASHBOARD } from '@/services/links';
import { syncedTabs, useStore } from '@/store';
import { GuideLinks } from '../ui/GuideLinks';

/** Picks a folder, then shows the editor with the folder panel open to choose a note from. */
async function openFolderFromStart(): Promise<void> {
  const { openFolder } = await import('@/services/folder');
  if (await openFolder()) useStore.getState().setScreen('editor');
}

/** Folders need the File System Access API's directory picker. */
const canOpenFolder = (): boolean => typeof window.showDirectoryPicker === 'function';

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
        <button
          type="button"
          className={`start-card${resumeId ? '' : ' start-card-primary'}`}
          onClick={() => void openDocument()}
          aria-labelledby="start-open-label"
          aria-describedby="start-open-hint"
        >
          <strong id="start-open-label">{t('start.open')}</strong>
          <span className="muted" id="start-open-hint">
            {t('start.openHint')}
          </span>
        </button>
        {canOpenFolder() ? (
          <button
            type="button"
            className="start-card"
            onClick={() => void openFolderFromStart()}
            aria-labelledby="start-folder-label"
            aria-describedby="start-folder-hint"
          >
            <strong id="start-folder-label">{t('start.openFolder')}</strong>
            <span className="muted" id="start-folder-hint">
              {t('start.openFolderHint')}
            </span>
          </button>
        ) : null}
      </div>
      <p className="start-more">
        <button type="button" className="link-button" onClick={() => void newDocument()}>
          {t('start.new')}
        </button>
        <span aria-hidden="true"> · </span>
        <button type="button" className="link-button" onClick={() => void openWelcome()}>
          {t('start.welcome')}
        </button>
      </p>

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
      <details className="start-help">
        <summary>{t('start.links')}</summary>
        <nav className="start-links" aria-label={t('start.links')}>
          <GuideLinks />
          <a href={DASHBOARD} target="_blank" rel="noopener">
            {t('start.dashboard')}
          </a>
        </nav>
      </details>
    </main>
  );
}
