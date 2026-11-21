// Content script UI: mounts the floating device windows inside a Shadow DOM on the active page.
import { render } from 'preact';
import { useLayoutEffect, useReducer } from 'preact/hooks';
import css from './style.css?inline';
import { DeviceWindow } from '@/components/DeviceWindow';
import { Sidebar } from '@/components/Sidebar';
import { sendMessage } from '@/lib/messages';
import { hasDevice } from '@/lib/devices';
import { getLastDeviceId } from '@/lib/storage';
import {
  getWindows,
  notifyResize,
  open,
  raiseTop,
  setOnEmpty,
  subscribe,
} from '@/lib/windowManager';

const HANDLE_KEY = '__deviceLab';
type Handle = { raise: () => void };

function App({ pageUrl }: { pageUrl: string }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // Layout effect: subscribe synchronously so a window opened right after mount is never missed.
  useLayoutEffect(() => subscribe(() => rerender(0)), []);
  const windows = getWindows();
  return (
    <>
      {windows.map((win) => (
        <DeviceWindow key={win.id} win={win} pageUrl={pageUrl} />
      ))}
      <Sidebar windows={windows} />
    </>
  );
}

export default defineContentScript({
  // Injected on demand from background.ts (activeTab + scripting), never declared in the manifest.
  registration: 'runtime',
  main() {
    const w = window as unknown as Record<string, Handle | undefined>;
    // A repeat toolbar click re-runs this script: just bring the windows forward.
    // New windows are opened from the icon bar.
    const existing = w[HANDLE_KEY];
    if (existing) {
      existing.raise();
      return;
    }

    const host = document.createElement('device-lab-root');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    const mount = document.createElement('div');
    shadow.append(style, mount);
    document.documentElement.append(host);

    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(notifyResize);
    };
    window.addEventListener('resize', onResize);

    const teardown = () => {
      setOnEmpty(undefined);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frame);
      render(null, mount);
      host.remove();
      delete w[HANDLE_KEY];
      sendMessage({ type: 'close' });
    };
    setOnEmpty(teardown);

    w[HANDLE_KEY] = { raise: raiseTop };

    render(<App pageUrl={location.href} />, mount);
    void getLastDeviceId().then((id) => {
      // A stored device that no longer exists falls back to the default.
      if (getWindows().length === 0 && w[HANDLE_KEY]) open(hasDevice(id) ? id : undefined);
    });
  },
});
