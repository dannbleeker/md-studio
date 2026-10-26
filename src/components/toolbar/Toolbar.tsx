import { isDirty } from '@/domain/document';
import { forPlatform } from '@/domain/keys';
import { useIsMobile } from '@/hooks/useIsMobile';
import { t } from '@/i18n';
import { newDocument, openDocument, openUserGuide, saveDocument } from '@/services/documentActions';
import { goBack, goForward, useNavHistory } from '@/services/noteHistory';
import { isMac } from '@/services/platform';
import { useStore } from '@/store';
import { EDIT_MODES, type EditMode } from '@/store/settings';
import { useUiStore } from '@/store/ui';
import { Menu, type MenuItem } from '../ui/Menu';
import { FolderIcon, MenuIcon, OutlineIcon } from './icons';

/** The editing layouts, in the order of their Ctrl+1 … Ctrl+3 shortcuts. */
const LAYOUT_KEYS: Record<EditMode, string> = { split: 'Ctrl+1', text: 'Ctrl+2', visual: 'Ctrl+3' };

/** Folders need the File System Access API's directory picker. */
const canOpenFolder = (): boolean => typeof window.showDirectoryPicker === 'function';

async function openFolderFromMenu(): Promise<void> {
  // Lazy: folder mode is its own chunk, kept out of start-up.
  const { openFolder } = await import('@/services/folder');
  await openFolder();
}

/**
 * Two modes: Read view, with Edit as its one main button, and editing, with
 * Save and a way back to reading. Everything else is in the ☰ menu (on a
 * phone, the layout and the panels too) or the command palette.
 */
export function Toolbar() {
  const fileName = useStore((s) => s.doc.fileName);
  const dirty = useStore((s) => isDirty(s.doc));
  const viewMode = useStore((s) => s.viewMode);
  const editMode = useStore((s) => s.settings.editMode);
  const showOutline = useStore((s) => s.settings.showOutline);
  const showFolder = useStore((s) => s.settings.showFolder);
  const { canBack, canForward } = useNavHistory();
  const { setViewMode, updateSettings, setScreen } = useStore.getState();
  const ui = useUiStore.getState();
  const isMobile = useIsMobile();
  const mac = isMac();
  const hint = (keys: string) => forPlatform(keys, mac);
  const reading = viewMode === 'read';

  const toggleFolder = () => updateSettings({ showFolder: !showFolder });
  const toggleOutline = () => updateSettings({ showOutline: !showOutline });

  // On a phone the toolbar keeps only the file, Edit or Read, Save and the menu.
  const phoneItems: MenuItem[] = isMobile
    ? [
        ...(canBack ? [{ label: t('nav.back'), onSelect: () => void goBack() }] : []),
        ...(canForward ? [{ label: t('nav.forward'), onSelect: () => void goForward() }] : []),
        ...(reading
          ? [
              { label: t('toolbar.readerTitle'), onSelect: () => ui.setReaderOpen(true) },
              { label: t('toolbar.focus'), onSelect: () => ui.setFocusMode(true) },
            ]
          : EDIT_MODES.map((mode) => ({
              label: t(`view.${mode}`),
              checked: viewMode === mode,
              onSelect: () => setViewMode(mode),
            }))),
        { label: t('folder.toolbar'), checked: showFolder, onSelect: toggleFolder },
        { label: t('toolbar.outline'), checked: showOutline, onSelect: toggleOutline },
        { kind: 'separator' },
      ]
    : [];
  const items: MenuItem[] = [
    ...phoneItems,
    { label: t('menu.new'), hint: hint('Alt+N'), onSelect: () => void newDocument() },
    { label: t('menu.open'), hint: hint('Ctrl+O'), onSelect: () => void openDocument() },
    ...(canOpenFolder()
      ? [{ label: t('menu.openFolder'), onSelect: () => void openFolderFromMenu() }]
      : []),
    {
      label: t('menu.saveAs'),
      hint: hint('Ctrl+Shift+S'),
      onSelect: () => void saveDocument(true),
    },
    { label: t('menu.export'), onSelect: () => ui.setExportOpen(true) },
    { kind: 'separator' },
    { label: t('toolbar.commands'), hint: hint('Ctrl+K'), onSelect: () => ui.setPaletteOpen(true) },
    { label: t('menu.shortcuts'), hint: '?', onSelect: () => ui.setShortcutsOpen(true) },
    {
      label: t('toolbar.settings'),
      hint: hint('Ctrl+,'),
      onSelect: () => ui.setSettingsOpen(true),
    },
    { label: t('start.guide'), onSelect: () => void openUserGuide() },
  ];

  return (
    <header className="toolbar">
      <div className="toolbar-group toolbar-file">
        <button type="button" className="btn btn-ghost brand" onClick={() => setScreen('start')}>
          {isMobile ? 'MD' : t('appName')}
        </button>
        {!isMobile && (canBack || canForward) ? (
          <span className="nav-buttons">
            <button
              type="button"
              className="btn-icon"
              disabled={!canBack}
              onClick={() => void goBack()}
              title={`${t('nav.back')} (${hint('Alt+Left')})`}
              aria-label={t('nav.back')}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn-icon"
              disabled={!canForward}
              onClick={() => void goForward()}
              title={`${t('nav.forward')} (${hint('Alt+Right')})`}
              aria-label={t('nav.forward')}
            >
              ›
            </button>
          </span>
        ) : null}
        <span className="file-name" title={fileName}>
          {fileName}
          {dirty ? (
            <span className="dirty-dot" role="img" aria-label={t('toolbar.unsaved')}>
              ●
            </span>
          ) : null}
        </span>
      </div>

      <div className="toolbar-group">
        {!isMobile && !reading ? (
          <fieldset className="segmented" aria-label={t('view.layout')}>
            {EDIT_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                title={hint(LAYOUT_KEYS[mode])}
              >
                {t(`view.${mode}`)}
              </button>
            ))}
          </fieldset>
        ) : null}
        {!isMobile && reading ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => ui.setReaderOpen(true)}
              title={t('toolbar.readerTitle')}
              aria-label={t('toolbar.readerTitle')}
            >
              {t('toolbar.reader')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => ui.setFocusMode(true)}
              title={t('toolbar.focusTitle')}
            >
              {t('toolbar.focus')}
            </button>
          </>
        ) : null}
        {isMobile ? null : (
          <span className="panel-buttons">
            <button
              type="button"
              className="btn-icon"
              aria-pressed={showFolder}
              aria-label={t('folder.toolbar')}
              title={t('folder.toolbar')}
              onClick={toggleFolder}
            >
              <FolderIcon />
            </button>
            <button
              type="button"
              className="btn-icon"
              aria-pressed={showOutline}
              aria-label={t('toolbar.outline')}
              title={`${t('toolbar.outline')} (${hint('Ctrl+Shift+O')})`}
              onClick={toggleOutline}
            >
              <OutlineIcon />
            </button>
          </span>
        )}
        {reading ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setViewMode(editMode);
              if (!useStore.getState().settings.tipSeen) updateSettings({ tipSeen: true });
            }}
            title={t('toolbar.editTitle')}
          >
            {t('toolbar.edit')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setViewMode('read')}
              title={`${t('toolbar.readTitle')} (${hint('Ctrl+4')})`}
            >
              {t('view.read')}
            </button>
            {/* Read view changes nothing, so Save is only offered while editing. */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveDocument()}
              title={hint('Ctrl+S')}
            >
              {t('toolbar.save')}
            </button>
          </>
        )}
        <Menu label={t('menu.label')} items={items}>
          <MenuIcon />
        </Menu>
      </div>
    </header>
  );
}
