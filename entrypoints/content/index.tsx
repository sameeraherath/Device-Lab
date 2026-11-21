// Content script UI: mounts one floating device window (iframe of this page) inside a Shadow DOM.
import { render } from 'preact';
import css from './style.css?inline';
import { sendToBackground } from '@/lib/messages';

const GUARD = '__deviceLabMounted';

function Spike({ onClose }: { onClose: () => void }) {
  return (
    <div class="window">
      <div class="titlebar">
        <span>Device Lab · 390×844</span>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <iframe class="screen" src={location.href} width="390" height="844" />
    </div>
  );
}

export default defineContentScript({
  // Injected on demand from background.ts (activeTab + scripting), never declared in the manifest.
  registration: 'runtime',
  main() {
    const w = window as unknown as Record<string, boolean>;
    if (w[GUARD]) return;
    w[GUARD] = true;

    const host = document.createElement('device-lab-root');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    const mount = document.createElement('div');
    shadow.append(style, mount);
    document.documentElement.append(host);

    const close = () => {
      render(null, mount);
      host.remove();
      w[GUARD] = false;
      sendToBackground({ type: 'close' });
    };
    render(<Spike onClose={close} />, mount);
  },
});
