// Screenshot engine. Chrome can only capture what is on screen (captureVisibleTab), so the device
// is captured exactly where it is and as large as it is shown: nothing moves or resizes.
// The "page" mode is the whole screen as it is: the page behind and every open device.
// For a transparent background, a small white then black patch is put behind the device itself
// (not the whole screen) and the alpha is recovered from the two shots. Everything it touches is
// put back in a `finally` block.
import { captureTab } from './messages';

export type CaptureMode = 'device' | 'screen' | 'page';

export interface CaptureResult {
  /** The image, at the size the device is shown on screen × the screen's pixel ratio. */
  canvas: HTMLCanvasElement;
  /** True when the corners/edges are transparent (the device with its frame). */
  transparent: boolean;
  /** Something the person should know. */
  note?: string;
}

export type Progress = (done: number, total: number) => void;

/** Chrome allows 2 captures per second: never ask for a third inside one second. */
const QUOTA_WINDOW_MS = 1050;
const QUOTA_CALLS = 2;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Two frames plus a beat, so a style change has been painted before the next capture. */
const paint = async () => {
  await frame();
  await frame();
  await sleep(40);
};

export class CaptureError extends Error {}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',');
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'image/png' });
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Session {
  /** Start times of recent captures, for the 2-per-second quota. */
  recent: number[];
  captures: number;
  expected: number;
  progress?: Progress;
}

/** One screenshot of the visible tab, as an image (no network request, so page CSP cannot block it). */
async function grab(s: Session): Promise<ImageBitmap> {
  if (s.recent.length >= QUOTA_CALLS) {
    const wait = (s.recent[s.recent.length - QUOTA_CALLS] ?? 0) + QUOTA_WINDOW_MS - Date.now();
    if (wait > 0) await sleep(wait);
  }
  s.recent.push(Date.now());
  const response = await captureTab();
  if (!response.ok) {
    throw new CaptureError(
      /activeTab|permission|cannot access/i.test(response.error)
        ? 'Chrome no longer allows capturing this tab. Click the Device Lab icon again, then retry.'
        : `Chrome could not capture the tab: ${response.error}`,
    );
  }
  const bitmap = await createImageBitmap(dataUrlToBlob(response.dataUrl));
  s.captures += 1;
  s.progress?.(Math.min(s.captures, s.expected), s.expected);
  return bitmap;
}

/** Image pixels per CSS px. The tab may be zoomed, so measure instead of trusting the DPR. */
function imageScale(bitmap: ImageBitmap): number {
  const client = document.documentElement.clientWidth || window.innerWidth;
  const guess = bitmap.width / window.devicePixelRatio;
  const cssWidth =
    Math.abs(guess - window.innerWidth) < Math.abs(guess - client) ? window.innerWidth : client;
  return bitmap.width / cssWidth;
}

/**
 * The whole image pixels that cover `rect` (in CSS px). Cropping on whole pixels copies them as they
 * are; a fractional crop would resample and soften the picture.
 */
function pixelRect(rect: Rect, sx: number, bitmap: ImageBitmap, inward = false): Rect {
  // Outward keeps the partly covered edge pixels (right for a device with transparent corners);
  // inward keeps only whole pixels of the rectangle, so no edge pixel is a blend with the bezel.
  const lo = inward ? Math.ceil : Math.floor;
  const hi = inward ? Math.floor : Math.ceil;
  const e = inward ? -1e-6 : 1e-6;
  const x0 = Math.max(0, lo(rect.x * sx + e));
  const y0 = Math.max(0, lo(rect.y * sx + e));
  const x1 = Math.min(bitmap.width, hi((rect.x + rect.w) * sx - e));
  const y1 = Math.min(bitmap.height, hi((rect.y + rect.h) * sx - e));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Copies a pixel rectangle out of a screenshot. */
function crop(bitmap: ImageBitmap, px: Rect): ImageData {
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
  return ctx.getImageData(0, 0, px.w, px.h);
}

/**
 * Recovers transparency from two shots of the same thing, one on white and one on black:
 * on black a pixel is colour × alpha, on white it is colour × alpha + (1 − alpha) × 255.
 */
function matte(white: ImageData, black: ImageData): ImageData {
  const out = new ImageData(white.width, white.height);
  const w = white.data;
  const b = black.data;
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    const diff = (w[i]! - b[i]! + (w[i + 1]! - b[i + 1]!) + (w[i + 2]! - b[i + 2]!)) / 3;
    const a = Math.max(0, Math.min(1, 1 - diff / 255));
    if (a < 0.004) continue; // fully transparent: leave 0,0,0,0
    o[i] = Math.min(255, b[i]! / a);
    o[i + 1] = Math.min(255, b[i + 1]! / a);
    o[i + 2] = Math.min(255, b[i + 2]! / a);
    o[i + 3] = Math.round(a * 255);
  }
  return out;
}

function toCanvas(data: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  c.getContext('2d')!.putImageData(data, 0, 0);
  return c;
}

export const measure = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export function assertInView(rect: Rect) {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const slack = 1.5;
  if (
    rect.x < -slack ||
    rect.y < -slack ||
    rect.x + rect.w > vw + slack ||
    rect.y + rect.h > vh + slack
  ) {
    throw new CaptureError(
      'Part of the device is off screen. Move it fully into view, then try again.',
    );
  }
}

/**
 * Takes a screenshot of one device window, where it is and as large as it is shown.
 * - `device`: the device with its frame, transparent outside the rounded edge, no shadow.
 * - `screen`: just the screen, as the device's own screenshot would be (status and browser bars included).
 * - `page`: the whole screen as it is, with the page behind and every open device (no icon bar).
 */
export async function captureWindow(
  root: ShadowRoot,
  windowId: number,
  mode: CaptureMode,
  progress?: Progress,
): Promise<CaptureResult> {
  const target = root.querySelector<HTMLElement>(`.window[data-window-id="${windowId}"]`);
  if (!target) throw new CaptureError('That device window is no longer open.');
  if (target.hasAttribute('data-minimized')) {
    throw new CaptureError('Restore the window first, then take the screenshot.');
  }
  const deviceEl = target.querySelector<HTMLElement>('.device');
  const screenEl = target.querySelector<HTMLElement>('.screen');
  const host = (root as ShadowRoot & { host: Element }).host;
  if (!deviceEl || !screenEl)
    throw new CaptureError('The device is not ready yet. Try again in a moment.');

  const session: Session = { recent: [], captures: 0, expected: 1, progress };
  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';

  try {
    // Mark the window: CSS turns off its shadows, and in screen and page modes square the screen
    // corners and hide the cutout and bars, for the moment of the capture only.
    target.setAttribute('data-capture-target', '');
    target.setAttribute('data-capture-mode', mode);

    if (mode === 'device') {
      const rect = measure(deviceEl);
      assertInView(rect);
      // A white then a black patch behind the device (only its own box, not the screen).
      // A few px larger than the device, so its own edge pixels sit fully on the patch.
      const m = 4;
      backdrop.style.cssText = `left:${rect.x - m}px;top:${rect.y - m}px;width:${rect.w + 2 * m}px;height:${rect.h + 2 * m}px;z-index:${getComputedStyle(target).zIndex}`;
      target.before(backdrop);
      session.expected = 2;
      await paint();
      const white = await grab(session);
      backdrop.style.background = '#000';
      await paint();
      const black = await grab(session);
      const px = pixelRect(rect, imageScale(white), white);
      const canvas = toCanvas(matte(crop(white, px), crop(black, px)));
      white.close();
      black.close();
      return { canvas, transparent: true };
    }

    if (mode === 'screen') {
      const rect = measure(screenEl);
      assertInView(rect);
      await paint();
      const shot = await grab(session);
      const px = pixelRect(rect, imageScale(shot), shot, true);
      // A device shown scaled down is smoothed across about one more pixel at its edges: leave
      // that pixel out too, so no edge pixel is a blend with the bezel.
      const scaled =
        Math.abs(
          parseFloat(target.querySelector<HTMLElement>('.device-scale')?.style.scale || '1') - 1,
        ) > 0.001;
      if (scaled && px.w > 4 && px.h > 4) {
        px.x += 1;
        px.y += 1;
        px.w -= 2;
        px.h -= 2;
      }
      const canvas = toCanvas(crop(shot, px));
      shot.close();
      return { canvas, transparent: false };
    }

    // Full page: the whole screen as it is, with the page behind and every open device.
    host.classList.add('capturing-view');
    await paint();
    const shot = await grab(session);
    const sx = imageScale(shot);
    const view = {
      x: 0,
      y: 0,
      w: document.documentElement.clientWidth || window.innerWidth,
      h: window.innerHeight,
    };
    const canvas = toCanvas(crop(shot, pixelRect(view, sx, shot)));
    shot.close();
    return { canvas, transparent: false };
  } finally {
    host.classList.remove('capturing-view');
    backdrop.remove();
    target.removeAttribute('data-capture-target');
    target.removeAttribute('data-capture-mode');
  }
}
