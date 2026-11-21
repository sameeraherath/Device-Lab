// Content-side bridge: lets the side panel see and control the device windows over a port.
import type { Browser } from 'wxt/browser';
import { devices } from './devices';
import { PANEL_PORT, type PanelCommand, type PanelState } from './messages';
import {
  MAX_WINDOWS,
  bringToFront,
  close,
  getWindows,
  open,
  subscribe,
  update,
} from './windowManager';

function snapshot(): PanelState {
  return {
    type: 'state',
    windows: getWindows().map(({ id, deviceId, rotated, minimized, z }) => ({
      id,
      deviceId,
      rotated,
      minimized,
      z,
    })),
    max: MAX_WINDOWS,
  };
}

function handle(cmd: PanelCommand) {
  const target = 'id' in cmd ? getWindows().find((w) => w.id === cmd.id) : undefined;
  switch (cmd.type) {
    case 'open':
      open();
      break;
    case 'close':
      if (target) close(cmd.id);
      break;
    case 'set-device':
      if (target && devices.some((d) => d.id === cmd.deviceId)) {
        update(cmd.id, { deviceId: cmd.deviceId });
      }
      break;
    case 'rotate':
      if (target) update(cmd.id, { rotated: !target.rotated });
      break;
    case 'toggle-minimize':
      if (target) update(cmd.id, { minimized: !target.minimized });
      break;
    case 'focus':
      if (target) bringToFront(cmd.id);
      break;
  }
}

/** Starts listening for the side panel; returns a function that stops everything. */
export function installPanelBridge(): () => void {
  const ports = new Set<Browser.runtime.Port>();
  let lastSent = '';

  const broadcast = () => {
    if (ports.size === 0) return;
    const state = snapshot();
    const json = JSON.stringify(state);
    // Drags and viewport resizes change positions only; skip them.
    if (json === lastSent) return;
    lastSent = json;
    ports.forEach((port) => port.postMessage(state));
  };

  const onConnect = (port: Browser.runtime.Port) => {
    if (port.name !== PANEL_PORT) return;
    ports.add(port);
    port.onMessage.addListener((cmd: PanelCommand) => handle(cmd));
    port.onDisconnect.addListener(() => {
      void browser.runtime.lastError;
      ports.delete(port);
    });
    const state = snapshot();
    lastSent = JSON.stringify(state);
    port.postMessage(state);
  };

  browser.runtime.onConnect.addListener(onConnect);
  const unsubscribe = subscribe(broadcast);

  return () => {
    unsubscribe();
    browser.runtime.onConnect.removeListener(onConnect);
    ports.forEach((port) => port.disconnect());
    ports.clear();
  };
}
