// Content-side recording control for one device window. The background worker and the offscreen
// recorder do the capturing; this measures the device's screen, keeps the window on top and
// untouched while recording, and exposes the state to the UI.
import { useEffect, useState } from 'preact/hooks';
import { runAutoScroll } from './autoScroll';
import { CaptureError, assertInView, measure } from './capture';
import { sendRecordMessage } from './messages';
import type { RecordPrefs } from './storage';

export type RecordPhase = 'idle' | 'countdown' | 'starting' | 'recording' | 'stopping';

export interface RecordState {
  phase: RecordPhase;
  /** The window being recorded. */
  windowId: number | null;
  /** Seconds left in the countdown (only in the `countdown` phase). */
  countdown: number;
  /** When the recording began (ms since epoch), for the timer. */
  startedAt: number | null;
  /** The last error, shown until the next attempt. */
  error: string | null;
}

const IDLE: RecordState = {
  phase: 'idle',
  windowId: null,
  countdown: 0,
  startedAt: null,
  error: null,
};

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
export async function startRecording(
  target: HTMLElement,
  deviceName: string,
  prefs: Pick<RecordPrefs, 'quality' | 'fps' | 'countdown' | 'autoScroll' | 'scrollSpeed'>,
): Promise<void> {
  if (state.phase !== 'idle') return;
  const windowId = Number(target.dataset.windowId);
  set({ ...IDLE, phase: 'starting', windowId });

  try {
    // Count down first. Cancel (the button) or closing the window ends it.
    for (let left = prefs.countdown; left > 0; left--) {
      set({ ...IDLE, phase: 'countdown', windowId, countdown: left });
      await new Promise<void>((r) => setTimeout(r, 1000));
      if (getRecordState().phase !== 'countdown') return; // cancelled
    }
    set({ ...IDLE, phase: 'starting', windowId });

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
        quality: prefs.quality,
        fps: prefs.fps,
      },
    });
    if (!response.ok) throw new CaptureError(response.error);
    set({ ...IDLE, phase: 'recording', windowId, startedAt: Date.now() });

    // The crop is fixed on the screen, so a moved or resized device would record the wrong area.
    const watch = window.setInterval(() => {
      const now = measure(screenEl);
      const moved = ['x', 'y', 'w', 'h'].some(
        (k) => Math.abs(now[k as keyof typeof now] - rect[k as keyof typeof rect]) > 0.5,
      );
      if (moved) void stopRecording('Recording stopped because the device was moved or resized.');
    }, 250);
    const previous = cleanup;
    let cancelScroll: (() => void) | undefined;
    cleanup = () => {
      window.clearInterval(watch);
      cancelScroll?.();
      previous?.();
    };

    // Scroll the page down by itself, then stop the recording when it reaches the bottom.
    const frame = target.querySelector<HTMLIFrameElement>('iframe.frame');
    if (prefs.autoScroll && frame) {
      cancelScroll = runAutoScroll(frame, prefs.scrollSpeed, () => void stopRecording());
    }
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

/** Cancels a countdown that has not started recording yet. */
export function cancelCountdown() {
  if (state.phase === 'countdown') set({ ...IDLE });
}

/** Stops a recording of a window that is closing, so the video is kept. */
export function stopIfRecording(windowId: number) {
  if (state.windowId !== windowId) return;
  if (state.phase === 'recording') void stopRecording();
  else cancelCountdown();
}

/** Hides the last error message. */
export function dismissRecordError() {
  if (state.phase === 'idle' && state.error) set({ ...IDLE });
}
