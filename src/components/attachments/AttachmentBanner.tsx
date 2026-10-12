import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import type { AttachmentStatus } from '@/services/attachments';
import { useStore } from '@/store';
import { dismissAttachmentBanner, useUiStore } from '@/store/ui';
import '@/styles/banner.css';

type AttachmentsModule = typeof import('@/services/attachments');

const COUNT_DEBOUNCE_MS = 500;
const COUNT_CAP = 99;

/** Cheap pre-check: most notes have no embed syntax, so nothing else loads. */
const mayHaveAttachments = (markdown: string) => markdown.includes('![') || markdown.includes('[[');

/**
 * How many embeds this text has that need files from disk. Wikilink
 * embeds and local Markdown images count; code is ignored, so a guide that
 * shows the syntax in a fence does not raise the notice.
 */
async function countAttachmentEmbeds(markdown: string): Promise<number> {
  const [embeds, links] = await Promise.all([
    import('@/domain/embeds'),
    import('@/domain/embedLinks'),
  ]);
  const wiki = embeds.findWikiRefs(markdown, { code: 'skip' }).filter((r) => r.embed).length;
  const images = links
    .findMarkdownImages(markdown, { code: 'skip' })
    .filter((i) => links.isLocalTarget(i.dest)).length;
  return Math.min(wiki + images, COUNT_CAP);
}

/*
 * Everything shown derives from the active tab's live fields. Results are
 * stamped with the tab and file they were computed for and ignored when
 * those no longer match, so a slow answer never lands on another note.
 */
type Counted = { tabId: string; count: number };
type Checked = { tabId: string; handleId: string | null; status: AttachmentStatus };

export function AttachmentBanner() {
  const activeTabId = useStore((s) => s.activeTabId);
  const fileHandle = useStore((s) => s.fileHandle);
  const handleId = useStore((s) => s.handleId);
  const markdown = useStore((s) => s.doc.markdown);
  const dismissed = useUiStore((s) => s.attachmentBannerDismissed[activeTabId] === true);
  const [mod, setMod] = useState<AttachmentsModule | null>(null);
  const [counted, setCounted] = useState<Counted | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);

  // Preloaded so the buttons can call the service inside the click itself:
  // the directory picker and the permission prompt need a fresh user gesture.
  useEffect(() => {
    let cancelled = false;
    void import('@/services/attachments').then((m) => {
      if (!cancelled) setMod(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!mayHaveAttachments(markdown)) {
        setCounted({ tabId: activeTabId, count: 0 });
        return;
      }
      void countAttachmentEmbeds(markdown)
        .then((count) => {
          if (!cancelled) setCounted({ tabId: activeTabId, count });
        })
        .catch(() => {});
    }, COUNT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [markdown, activeTabId]);

  const needed = counted !== null && counted.tabId === activeTabId && counted.count > 0;

  useEffect(() => {
    if (!mod || !needed) return;
    let cancelled = false;
    const check = () => {
      void mod
        .attachmentStatus({ fileHandle, handleId })
        .then((status) => {
          // The document in front may have changed while this was running.
          const now = useStore.getState();
          if (cancelled || now.activeTabId !== activeTabId || now.handleId !== handleId) return;
          setChecked({ tabId: activeTabId, handleId, status });
        })
        .catch(() => {});
    };
    check();
    const unsubscribe = mod.subscribeAttachments(check);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [mod, needed, activeTabId, handleId, fileHandle]);

  if (!mod || !needed || dismissed) return null;
  if (!checked || checked.tabId !== activeTabId || checked.handleId !== handleId) return null;
  const { status } = checked;

  const ctx = { fileHandle, handleId };
  // No await before the service call: it must start inside the click.
  const choose = () => {
    void mod.chooseAttachmentFolder(ctx);
  };
  const allow = () => {
    void mod.grantAttachmentAccess(ctx);
  };

  let message: string;
  let action: { label: string; run: () => void } | null = null;
  switch (status.kind) {
    case 'unsupported':
      message = t('attachment.banner.unsupported');
      break;
    case 'no-note-file':
      message = t('attachment.banner.noFile');
      break;
    case 'no-folder':
      message = t('attachment.banner.choose', { count: String(counted.count) });
      action = { label: t('attachment.banner.chooseButton'), run: choose };
      break;
    case 'needs-permission':
      message = t('attachment.banner.allow', { folder: status.folderName });
      action = { label: t('attachment.banner.allowButton'), run: allow };
      break;
    case 'ready':
      if (status.misses === 0 || status.isVaultRoot) return null;
      message = t('attachment.banner.notFound', { folder: status.folderName });
      action = { label: t('attachment.banner.chooseButton'), run: choose };
      break;
  }

  return (
    <div className="attachment-banner" role="status" aria-live="polite">
      <span className="attachment-banner-text">{message}</span>
      {action ? (
        <button type="button" className="btn" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-icon"
        aria-label={t('attachment.banner.dismiss')}
        onClick={() => dismissAttachmentBanner(activeTabId)}
      >
        ×
      </button>
    </div>
  );
}
