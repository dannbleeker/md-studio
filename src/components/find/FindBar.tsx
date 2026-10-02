import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { engineFor, type FindOptions, findTarget, type MatchInfo } from './findEngine';

const EMPTY: MatchInfo = { total: 0, current: 0, valid: true };

/**
 * Find & replace bar (Ctrl+F / Ctrl+H). Acts on the pane in view, or in
 * split view the pane last worked in; matches are highlighted there and the
 * current one is selected and scrolled to.
 */
export function FindBar() {
  const withReplace = useStore((s) => s.findWithReplace);
  const viewMode = useStore((s) => s.viewMode);
  const setFind = useStore((s) => s.setFind);
  const request = useStore((s) => s.findRequest);
  const input = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<FindOptions>({
    search: '',
    replace: '',
    caseSensitive: false,
    regexp: false,
    wholeWord: false,
  });
  const [info, setInfo] = useState<MatchInfo>(EMPTY);
  // The pane last worked in isn't reactive state, so re-read it on every
  // Ctrl+F / Ctrl+H: pressed again from the other pane, the bar retargets.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `request` is the trigger.
  const target = useMemo(() => findTarget(viewMode), [viewMode, request]);

  // Re-run whenever the query or the target pane changes.
  useEffect(() => {
    const engine = engineFor(target);
    setInfo(engine ? engine.apply(options) : EMPTY);
  }, [options, target]);

  // Clear highlights in both panes when the bar closes.
  useEffect(
    () => () => {
      engineFor('text')?.clear();
      engineFor('visual')?.clear();
    },
    []
  );

  // Focus on open, and again when Ctrl+F / Ctrl+H is pressed while open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `request` is the trigger.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [request]);

  const act = useCallback(
    (action: 'next' | 'prev' | 'replace' | 'replaceAll') => {
      const engine = engineFor(target);
      if (!engine) return;
      engine[action]();
      setInfo(engine.info());
    },
    [target]
  );

  const close = () => {
    setFind(false);
    engineFor(target)?.focus();
  };

  const toggle = (key: 'caseSensitive' | 'regexp' | 'wholeWord') =>
    setOptions((o) => ({ ...o, [key]: !o[key] }));

  const status = !info.valid
    ? t('find.invalid')
    : options.search === ''
      ? ''
      : info.total === 0
        ? t('find.none')
        : t('find.count', {
            current: info.current ? String(info.current) : '?',
            total: info.total >= 1000 ? '1000+' : String(info.total),
          });

  return (
    <search
      className="findbar"
      aria-label={t('find.title')}
      // Escape closes from anywhere in the bar, e.g. after clicking Replace all.
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="findbar-row">
        <input
          ref={input}
          className="findbar-input"
          type="search"
          aria-label={t('find.search')}
          placeholder={t('find.search')}
          value={options.search}
          onChange={(e) => setOptions((o) => ({ ...o, search: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              act(e.shiftKey ? 'prev' : 'next');
            }
          }}
        />
        <span className="findbar-status muted" role="status">
          {status}
        </span>
        <button
          type="button"
          className="btn-icon"
          onClick={() => act('prev')}
          title={t('find.prev')}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={() => act('next')}
          title={t('find.next')}
        >
          ↓
        </button>
        <button
          type="button"
          className="findbar-toggle"
          aria-pressed={options.caseSensitive}
          title={t('find.caseSensitive')}
          aria-label={t('find.caseSensitive')}
          onClick={() => toggle('caseSensitive')}
        >
          Aa
        </button>
        <button
          type="button"
          className="findbar-toggle"
          aria-pressed={options.wholeWord}
          title={t('find.wholeWord')}
          aria-label={t('find.wholeWord')}
          onClick={() => toggle('wholeWord')}
        >
          W
        </button>
        <button
          type="button"
          className="findbar-toggle"
          aria-pressed={options.regexp}
          title={t('find.regexp')}
          aria-label={t('find.regexp')}
          onClick={() => toggle('regexp')}
        >
          .*
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={() => setFind(true, !withReplace)}
          title={t('find.toggleReplace')}
          aria-label={t('find.toggleReplace')}
          aria-expanded={withReplace}
        >
          ⇄
        </button>
        <button type="button" className="btn-icon" onClick={close} aria-label={t('find.close')}>
          ×
        </button>
      </div>
      {withReplace ? (
        <div className="findbar-row">
          <input
            className="findbar-input"
            type="text"
            aria-label={t('find.replaceWith')}
            placeholder={t('find.replaceWith')}
            value={options.replace}
            onChange={(e) => setOptions((o) => ({ ...o, replace: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                act('replace');
              }
            }}
          />
          <button type="button" className="btn btn-small" onClick={() => act('replace')}>
            {t('find.replace')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => act('replaceAll')}>
            {t('find.replaceAll')}
          </button>
        </div>
      ) : null}
    </search>
  );
}
