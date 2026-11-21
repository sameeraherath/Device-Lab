// Background service worker: toolbar icon click injects the content UI and adds header-stripping rules.
import type { ContentToBackground } from '@/lib/messages';

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

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined || !tab.url) return;
    let host: string;
    try {
      const url = new URL(tab.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      host = url.hostname;
    } catch {
      return;
    }
    await addFrameRule(tab.id, host);
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/content-scripts/content.js'],
    });
  });

  browser.runtime.onMessage.addListener((message: ContentToBackground, sender) => {
    if (message.type === 'close' && sender.tab?.id !== undefined) {
      void removeFrameRule(sender.tab.id);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void removeFrameRule(tabId);
  });
});
