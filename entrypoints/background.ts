// Background service worker: toolbar icon click opens the side panel and injects the content UI.
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
    // Must come first: opening the side panel needs the click's user gesture.
    if (tab.windowId !== undefined) {
      void browser.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    void activate(tab);
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    if (message.type === 'close' && sender.tab?.id !== undefined) {
      void removeFrameRule(sender.tab.id);
    } else if (message.type === 'activate-tab') {
      // The URL is only readable while activeTab is granted for that tab.
      browser.tabs
        .get(message.tabId)
        .then(activate)
        .then((ok) => sendResponse({ ok }))
        .catch(() => sendResponse({ ok: false }));
      return true; // keep the channel open for the async response
    }
    return false;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void removeFrameRule(tabId);
  });
});
