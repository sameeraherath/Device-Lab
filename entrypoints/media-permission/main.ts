// A small window that only asks Chrome for microphone permission. The hidden recorder page cannot
// show the prompt itself, so it is asked for once here; after that the recorder can use the mic.
import type { RuntimeMessage } from '@/lib/messages';
import { setMicGranted } from '@/lib/storage';

const status = document.getElementById('status')!;
const retry = document.getElementById('retry') as HTMLButtonElement;

function report(ok: boolean, error?: string) {
  // Saved here too, so the answer is kept even if the background worker was restarted meanwhile.
  void setMicGranted(ok);
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

// Chrome stops an idle background worker after about 30 seconds, and it is waiting for this answer.
// A message every 20 seconds keeps it awake while the window is open.
setInterval(() => {
  void browser.runtime.sendMessage({ type: 'keepalive' } satisfies RuntimeMessage).catch(() => {});
}, 20_000);

retry.addEventListener('click', () => void ask());
void ask();
