// Background service worker: toolbar icon click adds the header rule and injects the content UI.
import type { Browser } from 'wxt/browser';
import type {
  OffscreenMessage,
  OffscreenStartResponse,
  OffscreenStopResponse,
  RecordResponse,
  RuntimeMessage,
} from '@/lib/messages';

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

// ---- Screen recording: tabCapture stream id -> offscreen recorder -> review page ----
const OFFSCREEN_URL = 'offscreen.html';
/** The tab being recorded. Only one recording runs at a time. */
let recordingTabId: number | undefined;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [browser.runtime.getURL(`/${OFFSCREEN_URL}`)],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await browser.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Record the tab video with MediaRecorder.',
  });
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) await browser.offscreen.closeDocument();
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function startRecording(
  tabId: number,
  options: Extract<RuntimeMessage, { type: 'record-start' }>['options'],
): Promise<RecordResponse> {
  if (recordingTabId !== undefined) {
    return { ok: false, error: 'A recording is already running. Stop it first.' };
  }
  try {
    // Needs the tab's activeTab grant, given by the toolbar click.
    const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreenDocument();
    const response = (await browser.runtime.sendMessage({
      target: 'offscreen',
      type: 'offscreen-start',
      streamId,
      options,
    } satisfies OffscreenMessage)) as OffscreenStartResponse | undefined;
    if (!response?.ok) {
      await closeOffscreenDocument();
      return { ok: false, error: response?.error ?? 'The recorder did not answer.' };
    }
    recordingTabId = tabId;
    return { ok: true };
  } catch (e) {
    await closeOffscreenDocument().catch(() => {});
    const text = errorText(e);
    return {
      ok: false,
      error: /activeTab|permission|invoked/i.test(text)
        ? 'Chrome no longer allows recording this tab. Click the Device Lab icon again, then retry.'
        : `Could not start recording: ${text}`,
    };
  }
}

async function stopRecording(): Promise<RecordResponse> {
  if (recordingTabId === undefined) return { ok: false, error: 'No recording is running.' };
  recordingTabId = undefined;
  try {
    const response = (await browser.runtime.sendMessage({
      target: 'offscreen',
      type: 'offscreen-stop',
    } satisfies OffscreenMessage)) as OffscreenStopResponse | undefined;
    if (!response?.ok)
      return { ok: false, error: response?.error ?? 'The recorder did not answer.' };
    await browser.tabs.create({
      url: `${browser.runtime.getURL('/recording.html')}?id=${response.id}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  } finally {
    await closeOffscreenDocument().catch(() => {});
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
    if (message.type === 'record-start' && sender.tab?.id !== undefined) {
      startRecording(sender.tab.id, message.options).then(sendResponse);
      return true;
    }
    if (message.type === 'record-stop') {
      stopRecording().then(sendResponse);
      return true;
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
    // The tab went away mid-recording: keep what was recorded and show it.
    if (tabId === recordingTabId) void stopRecording();
  });
});
