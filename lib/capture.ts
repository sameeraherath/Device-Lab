// Screenshot engine. Chrome can only capture what is on screen (captureVisibleTab), so the device
// is captured exactly where it is and as large as it is shown: nothing moves or resizes.
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
  /** Something the person should know, e.g. a full page that was cut at the size limit. */
  note?: string;
}

export type Progress = (done: number, total: number) => void;

/** Chrome allows 2 captures per second: never ask for a third inside one second. */
const QUOTA_WINDOW_MS = 1050;
const QUOTA_CALLS = 2;
/** Full page limits: tallest page in CSS px, and the canvas size limits that also apply. */
const MAX_PAGE_CSS_HEIGHT = 16000;
const MAX_CANVAS_SIDE = 32000;
const MAX_CANVAS_AREA = 260_000_000;
/** Time for lazy-loaded images and scroll effects to settle after a scroll. */
const SCROLL_SETTLE_MS = 350;

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

interface Rect {
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
function pixelRect(rect: Rect, sx: number, bitmap: ImageBitmap): Rect {
  const x0 = Math.max(0, Math.floor(rect.x * sx + 1e-6));
  const y0 = Math.max(0, Math.floor(rect.y * sx + 1e-6));
  const x1 = Math.min(bitmap.width, Math.ceil((rect.x + rect.w) * sx - 1e-6));
  const y1 = Math.min(bitmap.height, Math.ceil((rect.y + rect.h) * sx - 1e-6));
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

/** Hides fixed and sticky elements of a page so headers and chat bubbles do not repeat in a stitch. */
function hideFloating(doc: Document): () => void {
  const hidden: [HTMLElement, string][] = [];
  const view = doc.defaultView;
  if (view) {
    for (const el of doc.querySelectorAll<HTMLElement>('body *')) {
      const pos = view.getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        hidden.push([el, el.style.visibility]);
        el.style.visibility = 'hidden';
      }
    }
  }
  return () => hidden.forEach(([el, v]) => (el.style.visibility = v));
}

const measure = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

function assertInView(rect: Rect) {
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
 * - `page`: the whole scrolling page at the device's width, without frame or bars.
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
  const iframe = target.querySelector<HTMLIFrameElement>('iframe.frame');
  if (!deviceEl || !screenEl)
    throw new CaptureError('The device is not ready yet. Try again in a moment.');

  const session: Session = { recent: [], captures: 0, expected: 1, progress };
  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';
  const restoreFloating: (() => void)[] = [];
  let scrollBack: (() => void) | undefined;

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
      const canvas = toCanvas(crop(shot, pixelRect(rect, imageScale(shot), shot)));
      shot.close();
      return { canvas, transparent: false };
    }

    // Full page: scroll the framed page one screen at a time and stitch.
    if (!iframe) throw new CaptureError('This device has no page to capture.');
    const rect = measure(iframe);
    assertInView(rect);
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      doc = null;
    }
    const win = iframe.contentWindow;
    const docEl = doc?.documentElement;
    await paint();
    if (!doc || !win || !docEl) {
      const shot = await grab(session);
      const canvas = toCanvas(crop(shot, pixelRect(rect, imageScale(shot), shot)));
      shot.close();
      return {
        canvas,
        transparent: false,
        note: 'This page comes from another site, so it cannot be scrolled. Only the visible part was captured.',
      };
    }

    const scrollTop = win.scrollY;
    scrollBack = () => win.scrollTo({ top: scrollTop, behavior: 'instant' });
    // The page is shown scaled to fit: `k` is how many on-screen CSS px one page px takes.
    const k = rect.w / Math.max(1, iframe.clientWidth);
    const screenH = iframe.clientHeight; // page px visible at once
    const pageH = Math.max(docEl.scrollHeight, doc.body?.scrollHeight ?? 0, screenH);
    const pxPerPage = k * window.devicePixelRatio;
    const maxH = Math.max(
      screenH,
      Math.min(
        MAX_PAGE_CSS_HEIGHT,
        Math.floor(MAX_CANVAS_SIDE / pxPerPage),
        Math.floor(MAX_CANVAS_AREA / (rect.w * window.devicePixelRatio * pxPerPage)),
      ),
    );
    const total = Math.min(pageH, maxH);
    const steps = Math.max(1, Math.ceil(total / screenH));
    session.expected = steps;

    let canvas: HTMLCanvasElement | undefined;
    let sx = 0;
    let px: Rect | undefined;
    for (let i = 0; i < steps; i++) {
      win.scrollTo({
        top: Math.min(i * screenH, Math.max(0, total - screenH)),
        behavior: 'instant',
      });
      await sleep(SCROLL_SETTLE_MS);
      const actual = win.scrollY;
      const shot = await grab(session);
      if (!canvas) {
        sx = imageScale(shot);
        px = pixelRect(rect, sx, shot);
        canvas = document.createElement('canvas');
        canvas.width = px.w;
        canvas.height = Math.round(total * k * sx);
        // The first screen keeps headers, as a visitor sees the page. After it they would
        // repeat on every screen, so hide fixed and sticky elements for the rest.
        if (steps > 1) restoreFloating.push(hideFloating(doc));
      }
      canvas
        .getContext('2d')!
        .drawImage(shot, px!.x, px!.y, px!.w, px!.h, 0, Math.round(actual * k * sx), px!.w, px!.h);
      shot.close();
    }
    return {
      canvas: canvas!,
      transparent: false,
      note:
        pageH > total
          ? `The page is ${pageH.toLocaleString()} px tall; the screenshot stops at ${total.toLocaleString()} px.`
          : undefined,
    };
  } finally {
    restoreFloating.forEach((f) => f());
    scrollBack?.();
    backdrop.remove();
    target.removeAttribute('data-capture-target');
    target.removeAttribute('data-capture-mode');
  }
}
