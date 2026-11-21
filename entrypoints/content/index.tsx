// Content script UI: mounts the floating device windows inside a Shadow DOM on the active page.
import { render } from 'preact';
import { useLayoutEffect, useReducer } from 'preact/hooks';
import css from './style.css?inline';
import { DeviceWindow } from '@/components/DeviceWindow';
import { sendToBackground } from '@/lib/messages';
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
type Handle = { openWindow: () => void };

function App({ pageUrl }: { pageUrl: string }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // Layout effect: subscribe synchronously so a window opened right after mount is never missed.
  useLayoutEffect(() => subscribe(() => rerender(0)), []);
  const windows = getWindows();
  return (
    <>
      {windows.map((win) => (
        <DeviceWindow key={win.id} win={win} count={windows.length} pageUrl={pageUrl} />
      ))}
    </>
  );
}

export default defineContentScript({
  // Injected on demand from background.ts (activeTab + scripting), never declared in the manifest.
  registration: 'runtime',
  main() {
    const w = window as unknown as Record<string, Handle | undefined>;
    // A repeat toolbar click re-runs this script: add a window to the existing UI instead.
    const existing = w[HANDLE_KEY];
    if (existing) {
      existing.openWindow();
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
      sendToBackground({ type: 'close' });
    };
    setOnEmpty(teardown);

    w[HANDLE_KEY] = {
      openWindow: () => {
        if (!open()) raiseTop();
      },
    };

    render(<App pageUrl={location.href} />, mount);
    void getLastDeviceId().then((id) => {
      if (getWindows().length === 0 && w[HANDLE_KEY]) open(id);
    });
  },
});
