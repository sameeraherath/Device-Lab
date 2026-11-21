// Typed messages sent from the content script to the background worker.
export type RuntimeMessage = { type: 'close' }; // last window closed: drop the header rule

export function sendMessage(message: RuntimeMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {});
}
