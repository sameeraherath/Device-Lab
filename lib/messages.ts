// Typed messages between the background worker, the content script and the side panel.
export const PANEL_PORT = 'device-lab-panel';

/** What the side panel needs to know about one device window. */
export interface WindowSnapshot {
  id: number;
  deviceId: string;
  rotated: boolean;
  minimized: boolean;
  z: number;
}

/** Content script -> side panel, over the long-lived port. */
export interface PanelState {
  type: 'state';
  windows: WindowSnapshot[];
  max: number;
}

/** Side panel -> content script, over the long-lived port. */
export type PanelCommand =
  | { type: 'open' }
  | { type: 'close'; id: number }
  | { type: 'set-device'; id: number; deviceId: string }
  | { type: 'rotate'; id: number }
  | { type: 'toggle-minimize'; id: number }
  | { type: 'focus'; id: number };

/** One-off runtime messages. */
export type RuntimeMessage =
  | { type: 'close' } // content -> background: last window closed, drop the header rule
  | { type: 'content-ready' } // content -> side panel: UI mounted, connect now
  | { type: 'activate-tab'; tabId: number }; // side panel -> background: (re)inject into a tab

export function sendMessage(message: RuntimeMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {});
}
