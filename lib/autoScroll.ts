// Auto-scroll for the framed page while recording. It only works while the frame is same-origin
// (the same condition the scrollbar hiding and theme colours already rely on).
import type { ScrollSpeed } from './storage';

/** Page pixels per second, in the device's own CSS pixels, so a speed feels the same on any device. */
export const SCROLL_SPEEDS: Record<ScrollSpeed, number> = {
  slow: 60,
  medium: 150,
  fast: 300,
};

/** How long to stay at the bottom before the recording stops. */
const HOLD_AT_BOTTOM_MS = 1000;

function scroller(frame: HTMLIFrameElement | null | undefined): Element | null {
  try {
    return frame?.contentDocument?.scrollingElement ?? null;
  } catch {
    return null; // cross-origin frame
  }
}

/** True when the framed page can be scrolled by script. */
export function canAutoScroll(frame: HTMLIFrameElement | null | undefined): boolean {
  return scroller(frame) !== null;
}

const maxScroll = (el: Element) => Math.max(0, el.scrollHeight - el.clientHeight);

/**
 * Scrolls the framed page down at `speed`, from where it is now. Calls `onDone` after it has
 * rested at the bottom for a moment, then stops. Returns a function that cancels it.
 * Does nothing (and never calls `onDone`) when the page has nowhere to scroll.
 */
export function runAutoScroll(
  frame: HTMLIFrameElement,
  speed: ScrollSpeed,
  onDone: () => void,
): () => void {
  const el = scroller(frame);
  if (!el || maxScroll(el) <= 0) return () => {};

  const pxPerMs = SCROLL_SPEEDS[speed] / 1000;
  let pos = el.scrollTop;
  let last = performance.now();
  let atBottomSince: number | null = null;
  let raf = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    // Someone scrolled by hand: carry on from where they left it.
    if (Math.abs(el.scrollTop - pos) > 2) pos = el.scrollTop;
    const max = maxScroll(el); // lazy-loaded pages grow while we scroll
    pos = Math.min(max, pos + (now - last) * pxPerMs);
    last = now;
    el.scrollTo({ top: pos, behavior: 'instant' }); // ignore the page's own smooth scrolling
    if (pos >= max - 0.5) {
      atBottomSince ??= now;
      if (now - atBottomSince >= HOLD_AT_BOTTOM_MS) {
        stopped = true;
        onDone();
        return;
      }
    } else {
      atBottomSince = null;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
