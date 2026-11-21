// Right-hand side panel: lists device windows on the active tab and controls the focused one.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Browser } from 'wxt/browser';
import { getDevice } from '@/lib/devices';
import {
  PANEL_PORT,
  type PanelCommand,
  type PanelState,
  type RuntimeMessage,
} from '@/lib/messages';
import { DevicePicker } from './DevicePicker';
import { ScreenshotMenu } from './ScreenshotMenu';

type Port = Browser.runtime.Port;

export function SidePanel() {
  const [state, setState] = useState<PanelState | null>(null);
  const [status, setStatus] = useState('');
  const [hint, setHint] = useState('');
  const portRef = useRef<Port | null>(null);
  const tabIdRef = useRef<number | undefined>(undefined);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Connect to the content script of the active tab; reconnect when the tab or page changes.
  useEffect(() => {
    let disposed = false;
    let attempt = 0;

    const disconnect = () => {
      const port = portRef.current;
      portRef.current = null;
      port?.disconnect();
    };

    const connect = async () => {
      const mine = ++attempt;
      disconnect();
      setState(null);
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (disposed || mine !== attempt) return;
      tabIdRef.current = tab?.id;
      if (tab?.id === undefined) return;
      const port = browser.tabs.connect(tab.id, { name: PANEL_PORT });
      portRef.current = port;
      port.onMessage.addListener((message: PanelState) => {
        if (message.type === 'state') setState(message);
      });
      port.onDisconnect.addListener(() => {
        void browser.runtime.lastError; // "no receiver" just means no Device Lab on this tab
        if (portRef.current === port) {
          portRef.current = null;
          setState(null);
        }
      });
    };

    const onActivated = () => void connect();
    const onMessage = (message: RuntimeMessage, sender: Browser.runtime.MessageSender) => {
      if (
        message.type === 'content-ready' &&
        sender.tab?.id !== undefined &&
        sender.tab.id === tabIdRef.current &&
        !portRef.current
      ) {
        void connect();
      }
    };

    browser.tabs.onActivated.addListener(onActivated);
    browser.runtime.onMessage.addListener(onMessage);
    void connect();

    return () => {
      disposed = true;
      browser.tabs.onActivated.removeListener(onActivated);
      browser.runtime.onMessage.removeListener(onMessage);
      disconnect();
    };
  }, []);

  // Clear the live-region message after it has been announced.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(''), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const windows = state?.windows ?? [];
  const selected = windows.reduce<(typeof windows)[number] | undefined>(
    (top, w) => (!top || w.z > top.z ? w : top),
    undefined,
  );
  const hasWindows = windows.length > 0;

  // Roving tab stop for the toolbar where native `focusgroup` is unavailable.
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return;
    const items = [...bar.querySelectorAll<HTMLButtonElement>('button')];
    items.forEach((item, i) => (item.tabIndex = i === 0 ? 0 : -1));
    const onFocusIn = (e: FocusEvent) =>
      items.forEach((item) => (item.tabIndex = item === e.target ? 0 : -1));
    const onKeyDown = (e: KeyboardEvent) => {
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      const rtl = getComputedStyle(bar).direction === 'rtl';
      let next: number;
      if (e.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
      else if (e.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else return;
      e.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [hasWindows]);

  const send = (command: PanelCommand) => portRef.current?.postMessage(command);

  const openAnother = () => {
    if (state && windows.length >= state.max) return;
    send({ type: 'open' });
  };

  const openFirst = async () => {
    setHint('');
    const tabId = tabIdRef.current;
    const response =
      tabId === undefined
        ? undefined
        : await browser.runtime
            .sendMessage({ type: 'activate-tab', tabId } satisfies RuntimeMessage)
            .catch(() => undefined);
    if (!response?.ok) setHint('Click the Device Lab toolbar icon on this page to start.');
  };

  return (
    <main>
      <h1>Device Lab</h1>

      {!hasWindows || !selected ? (
        <section class="empty">
          <p>No device windows on this page.</p>
          <button type="button" class="primary" onClick={() => void openFirst()}>
            Open device window
          </button>
          {hint && <p class="hint">{hint}</p>}
        </section>
      ) : (
        <>
          <section aria-labelledby="windows-heading">
            <div class="heading-row">
              <h2 id="windows-heading">Windows</h2>
              <button
                type="button"
                class="btn"
                aria-disabled={windows.length >= (state?.max ?? 3)}
                title={windows.length >= (state?.max ?? 3) ? 'Maximum windows open' : 'New window'}
                onClick={openAnother}
              >
                + New window
              </button>
            </div>
            <ul class="windows">
              {[...windows]
                .sort((a, b) => a.id - b.id)
                .map((w) => {
                  const device = getDevice(w.deviceId);
                  const isSelected = w.id === selected.id;
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        class="window-item"
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => send({ type: 'focus', id: w.id })}
                      >
                        <span class="name">{device.name}</span>
                        <span class="meta">
                          {w.rotated ? 'Landscape' : 'Portrait'}
                          {w.minimized ? ' · Minimized' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section aria-labelledby="controls-heading">
            <h2 id="controls-heading">Focused window</h2>
            <label class="field">
              <span>Device</span>
              <DevicePicker
                value={selected.deviceId}
                onChange={(deviceId) => send({ type: 'set-device', id: selected.id, deviceId })}
              />
            </label>
            <div
              ref={toolbarRef}
              class="toolbar"
              role="toolbar"
              aria-label="Window actions"
              {...({ focusgroup: 'toolbar wrap' } as object)}
            >
              <button
                type="button"
                class="btn"
                onClick={() => {
                  send({ type: 'rotate', id: selected.id });
                  setStatus(`Rotated to ${selected.rotated ? 'portrait' : 'landscape'}`);
                }}
              >
                Rotate
              </button>
              <button
                type="button"
                class="btn"
                aria-pressed={selected.minimized}
                onClick={() => {
                  send({ type: 'toggle-minimize', id: selected.id });
                  setStatus(selected.minimized ? 'Window restored' : 'Window minimized');
                }}
              >
                Minimize
              </button>
              <ScreenshotMenu />
              <button
                type="button"
                class="btn"
                onClick={() => {
                  send({ type: 'close', id: selected.id });
                  setStatus('Window closed');
                }}
              >
                Close
              </button>
            </div>
          </section>
        </>
      )}
      <p class="visually-hidden" role="status">
        {status}
      </p>
    </main>
  );
}
