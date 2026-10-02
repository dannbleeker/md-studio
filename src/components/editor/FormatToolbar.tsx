import type { CmdKey } from '@milkdown/kit/core';
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  updateLinkCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { callCommand } from '@milkdown/kit/utils';
import type { ReactNode } from 'react';
import { forPlatform } from '@/domain/keys';
import { t } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { isMac } from '@/services/platform';
import { requestPrompt, useUiStore } from '@/store/ui';
import { editors } from './editorRegistry';

/** Runs a Milkdown command on the visual pane and keeps its focus. */
function run<T>(key: CmdKey<T>, payload?: T): void {
  const editor = editors.milkdown;
  if (!editor) return;
  editor.action(callCommand(key, payload));
  editors.visual?.focus();
}

async function editLink(current: string | null): Promise<void> {
  const href = await requestPrompt({
    title: t('format.link'),
    label: t('format.linkAddress'),
    initial: current ?? 'https://',
    confirmLabel: t('format.linkApply'),
  });
  if (href === null) return editors.visual?.focus();
  if (current !== null) {
    // An existing link: empty removes it, anything else retargets it.
    if (href.trim() === '') run(toggleLinkCommand.key);
    else run(updateLinkCommand.key, { href: href.trim() });
  } else if (href.trim() !== '') {
    run(toggleLinkCommand.key, { href: href.trim() });
  }
}

function Button({
  label,
  pressed,
  onRun,
  children,
}: {
  label: MessageKey;
  pressed?: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="format-btn"
      aria-label={forPlatform(t(label), isMac())}
      title={forPlatform(t(label), isMac())}
      aria-pressed={pressed}
      // mousedown, not click: the visual pane keeps its selection and focus.
      onMouseDown={(e) => {
        e.preventDefault();
        onRun();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRun();
        }
      }}
    >
      {children}
    </button>
  );
}

/**
 * Formatting without keyboard shortcuts, above the visual pane. Buttons
 * show as pressed when the selection already has that formatting.
 */
export function FormatToolbar() {
  const f = useUiStore((s) => s.format);
  return (
    <div className="format-toolbar" role="toolbar" aria-label={t('format.toolbar')}>
      <select
        className="format-block"
        aria-label={t('format.blockType')}
        value={f.block < 0 ? '' : String(f.block)}
        onChange={(e) => {
          const level = Number(e.target.value);
          if (level === 0) run(turnIntoTextCommand.key);
          else run(wrapInHeadingCommand.key, level);
        }}
      >
        {f.block < 0 ? <option value="">{t('format.other')}</option> : null}
        <option value="0">{t('format.paragraph')}</option>
        {[1, 2, 3, 4].map((level) => (
          <option key={level} value={level}>
            {t('format.heading', { level: String(level) })}
          </option>
        ))}
      </select>
      <span className="format-sep" />
      <Button label="format.bold" pressed={f.strong} onRun={() => run(toggleStrongCommand.key)}>
        <b>B</b>
      </Button>
      <Button
        label="format.italic"
        pressed={f.emphasis}
        onRun={() => run(toggleEmphasisCommand.key)}
      >
        <i>I</i>
      </Button>
      <Button
        label="format.strike"
        pressed={f.strike}
        onRun={() => run(toggleStrikethroughCommand.key)}
      >
        <s>S</s>
      </Button>
      <Button label="format.code" pressed={f.code} onRun={() => run(toggleInlineCodeCommand.key)}>
        <code>{'</>'}</code>
      </Button>
      <Button label="format.link" pressed={f.link !== null} onRun={() => void editLink(f.link)}>
        🔗
      </Button>
      <span className="format-sep" />
      <Button label="format.bulletList" onRun={() => run(wrapInBulletListCommand.key)}>
        •≡
      </Button>
      <Button label="format.orderedList" onRun={() => run(wrapInOrderedListCommand.key)}>
        1≡
      </Button>
      <Button label="format.quote" onRun={() => run(wrapInBlockquoteCommand.key)}>
        ❝
      </Button>
      <Button label="format.codeBlock" onRun={() => run(createCodeBlockCommand.key)}>
        {'{ }'}
      </Button>
      <Button label="format.table" onRun={() => run(insertTableCommand.key, { row: 3, col: 3 })}>
        ▦
      </Button>
      <Button label="format.rule" onRun={() => run(insertHrCommand.key)}>
        ―
      </Button>
    </div>
  );
}
