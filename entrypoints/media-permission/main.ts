// A small window that only asks Chrome for microphone permission. The hidden recorder page cannot
// show the prompt itself, so it is asked for once here; after that the recorder can use the mic.
import type { RuntimeMessage } from '@/lib/messages';

const status = document.getElementById('status')!;
const retry = document.getElementById('retry') as HTMLButtonElement;

function report(ok: boolean, error?: string) {
  void browser.runtime
    .sendMessage({ type: 'mic-result', ok, ...(error ? { error } : {}) } satisfies RuntimeMessage)
    .catch(() => {});
}

async function ask() {
  retry.hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone allowed. You can close this window.';
    report(true);
  } catch (e) {
    const denied = e instanceof DOMException && /NotAllowed|Security/.test(e.name);
    const notFound = e instanceof DOMException && e.name === 'NotFoundError';
    const message = denied
      ? 'The microphone is blocked. Allow it for Device Lab in Chrome’s site settings, then try again.'
      : notFound
        ? 'No microphone was found. Connect one, then try again.'
        : 'The microphone could not be used.';
    status.textContent = message;
    retry.hidden = false;
    report(false, message);
  }
}

retry.addEventListener('click', () => void ask());
void ask();
