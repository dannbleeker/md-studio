import { beforeEach, describe, expect, it } from 'vitest';
import { dismissAttachmentBanner, resetDialogsForTest, useUiStore } from './ui';

describe('attachment notice dismissal', () => {
  beforeEach(() => resetDialogsForTest());

  it('starts with nothing dismissed', () => {
    expect(useUiStore.getState().attachmentBannerDismissed).toEqual({});
  });

  it('dismisses one tab without touching the others', () => {
    dismissAttachmentBanner('tab-a');
    const dismissed = useUiStore.getState().attachmentBannerDismissed;
    expect(dismissed['tab-a']).toBe(true);
    expect(dismissed['tab-b']).toBeUndefined();
  });

  it('keeps earlier dismissals when another tab is dismissed', () => {
    dismissAttachmentBanner('tab-a');
    dismissAttachmentBanner('tab-b');
    expect(useUiStore.getState().attachmentBannerDismissed).toEqual({
      'tab-a': true,
      'tab-b': true,
    });
  });

  it('is cleared by resetDialogsForTest', () => {
    dismissAttachmentBanner('tab-a');
    resetDialogsForTest();
    expect(useUiStore.getState().attachmentBannerDismissed).toEqual({});
  });
});
