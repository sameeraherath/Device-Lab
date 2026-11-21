// Typed messages sent from the content script to the background worker.
export type ContentToBackground = { type: 'close' };

export function sendToBackground(message: ContentToBackground): void {
  void browser.runtime.sendMessage(message).catch(() => {});
}
