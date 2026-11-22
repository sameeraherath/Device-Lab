// Background service worker: toolbar icon click adds the header rule and injects the content UI.
import type { Browser } from 'wxt/browser';
import type { RuntimeMessage } from '@/lib/messages';

// One session rule per tab; the tab id doubles as the rule id.
async function addFrameRule(tabId: number, host: string) {
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [
      {
        id: tabId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
          ],
        },
        condition: {
          tabIds: [tabId],
          resourceTypes: ['sub_frame'],
          requestDomains: [host],
          initiatorDomains: [host],
        },
      },
    ],
  });
}

async function removeFrameRule(tabId: number) {
  await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
}

/** Adds the header rule and injects the content script. Needs activeTab (URL must be readable). */
async function activate(tab: Browser.tabs.Tab): Promise<boolean> {
  if (tab.id === undefined || !tab.url) return false;
  let host: string;
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    host = url.hostname;
  } catch {
    return false;
  }
  try {
    await addFrameRule(tab.id, host);
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/content-scripts/content.js'],
    });
    return true;
  } catch {
    return false;
  }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    void activate(tab);
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    if (message.type === 'close' && sender.tab?.id !== undefined) {
      void removeFrameRule(sender.tab.id);
      return;
    }
    if (message.type === 'capture') {
      // Needs the tab's activeTab grant (given by the toolbar click); captures what is on screen.
      const windowId = sender.tab?.windowId ?? browser.windows.WINDOW_ID_CURRENT;
      browser.tabs
        .captureVisibleTab(windowId, { format: 'png' })
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((e: unknown) =>
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        );
      return true; // the answer comes asynchronously
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void removeFrameRule(tabId);
  });
});
