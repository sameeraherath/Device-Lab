// Content-side recording control for one device window. The background worker and the offscreen
// recorder do the capturing; this measures the device's screen, keeps the window on top and
// untouched while recording, and exposes the state to the UI.
import { useEffect, useState } from 'preact/hooks';
import { CaptureError, assertInView, measure } from './capture';
import { sendRecordMessage } from './messages';

export type RecordPhase = 'idle' | 'starting' | 'recording' | 'stopping';

export interface RecordState {
  phase: RecordPhase;
  /** The window being recorded. */
  windowId: number | null;
  /** When the recording began (ms since epoch), for the timer. */
  startedAt: number | null;
  /** The last error, shown until the next attempt. */
  error: string | null;
}

const IDLE: RecordState = { phase: 'idle', windowId: null, startedAt: null, error: null };

let state: RecordState = IDLE;
let cleanup: (() => void) | undefined;
const listeners = new Set<() => void>();

function set(next: RecordState) {
  state = next;
  listeners.forEach((fn) => fn());
}

export const getRecordState = () => state;

export function subscribeRecord(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Re-renders the component whenever the recording state changes. */
export function useRecordState(): RecordState {
  const [, tick] = useState(0);
  useEffect(() => subscribeRecord(() => tick((n) => n + 1)), []);
  return state;
}

/**
 * Starts recording the screen of one device window.
 * `target` is the window's root element (`.window`).
 */
export async function startRecording(target: HTMLElement, deviceName: string): Promise<void> {
  if (state.phase !== 'idle') return;
  const windowId = Number(target.dataset.windowId);
  set({ phase: 'starting', windowId, startedAt: null, error: null });

  try {
    if (target.hasAttribute('data-minimized')) {
      throw new CaptureError('Restore the window first, then start recording.');
    }
    const screenEl = target.querySelector<HTMLElement>('.screen');
    if (!screenEl) throw new CaptureError('The device is not ready yet. Try again in a moment.');
    const rect = measure(screenEl);
    assertInView(rect);

    // Same look as a "screen" screenshot: square corners, no cutout. Removed when it ends.
    target.setAttribute('data-capture-target', '');
    target.setAttribute('data-capture-mode', 'screen');
    cleanup = () => {
      target.removeAttribute('data-capture-target');
      target.removeAttribute('data-capture-mode');
    };

    // Paint the capture look before the first video frame is taken.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const scaled =
      Math.abs(
        parseFloat(target.querySelector<HTMLElement>('.device-scale')?.style.scale || '1') - 1,
      ) > 0.001;
    const response = await sendRecordMessage({
      type: 'record-start',
      options: {
        rect,
        viewport: {
          w: document.documentElement.clientWidth || window.innerWidth,
          h: window.innerHeight,
        },
        deviceName,
        trim: scaled ? 1 : 0,
      },
    });
    if (!response.ok) throw new CaptureError(response.error);
    set({ phase: 'recording', windowId, startedAt: Date.now(), error: null });

    // The crop is fixed on the screen, so a moved or resized device would record the wrong area.
    const watch = window.setInterval(() => {
      const now = measure(screenEl);
      const moved = ['x', 'y', 'w', 'h'].some(
        (k) => Math.abs(now[k as keyof typeof now] - rect[k as keyof typeof rect]) > 0.5,
      );
      if (moved) void stopRecording('Recording stopped because the device was moved or resized.');
    }, 250);
    const previous = cleanup;
    cleanup = () => {
      window.clearInterval(watch);
      previous?.();
    };
  } catch (e) {
    cleanup?.();
    cleanup = undefined;
    set({ ...IDLE, windowId, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Stops the recording. The background worker then opens the review page. */
export async function stopRecording(note?: string): Promise<void> {
  if (state.phase !== 'recording') return;
  const { windowId } = state;
  set({ ...state, phase: 'stopping' });
  cleanup?.();
  cleanup = undefined;
  const response = await sendRecordMessage({ type: 'record-stop' });
  set({ ...IDLE, windowId, error: response.ok ? (note ?? null) : response.error });
}

/** Stops a recording of a window that is closing, so the video is kept. */
export function stopIfRecording(windowId: number) {
  if (state.windowId === windowId && state.phase === 'recording') void stopRecording();
}

/** Hides the last error message. */
export function dismissRecordError() {
  if (state.phase === 'idle' && state.error) set({ ...IDLE });
}
