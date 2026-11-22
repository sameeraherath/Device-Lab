// Screenshot engine. Chrome can only capture what is on screen (captureVisibleTab), so a device
// window is shown alone at its real size on a plain backdrop, captured in viewport-sized tiles,
// and stitched on a canvas. Everything it changes in the page is put back in a `finally` block.
import { captureTab } from './messages';

export type CaptureMode = 'device' | 'screen' | 'page';

export interface CaptureResult {
  /** Full-resolution image: CSS size × the screen's pixel ratio. */
  canvas: HTMLCanvasElement;
  /** True when the corners/edges are transparent (the device with its frame). */
  transparent: boolean;
  /** Something the person should know, e.g. a full page that was cut at the size limit. */
  note?: string;
}

export type Progress = (done: number, total: number) => void;

/** Chrome allows about 2 captures a second; stay just under it. */
const CAPTURE_GAP_MS = 550;
/** Largest full page we stitch, in CSS px, and the canvas limits that also apply. */
const MAX_PAGE_CSS_HEIGHT = 16000;
const MAX_CANVAS_SIDE = 32000;
const MAX_CANVAS_AREA = 260_000_000;
/** Time for lazy-loaded images and scroll effects to settle after a scroll. */
const SCROLL_SETTLE_MS = 350;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const settle = async () => {
  await frame();
  await frame();
};

export class CaptureError extends Error {}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',');
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'image/png' });
}

interface Session {
  root: ShadowRoot;
  host: Element;
  target: HTMLElement;
  backdrop: HTMLElement;
  lastCapture: number;
  captures: number;
  expected: number;
  progress?: Progress;
}

/** One screenshot of the visible tab, as an image (no network request, so page CSP cannot block it). */
async function grab(s: Session): Promise<ImageBitmap> {
  const wait = s.lastCapture + CAPTURE_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const response = await captureTab();
  s.lastCapture = Date.now();
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

const setBackdrop = async (s: Session, color: string) => {
  s.backdrop.style.background = color;
  await settle();
  await sleep(60); // let the compositor paint before the capture
};

interface Viewport {
  /** Capturable area in CSS px (excludes scroll bars). */
  w: number;
  h: number;
}

const viewport = (): Viewport => ({
  w: document.documentElement.clientWidth || window.innerWidth,
  h: Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight),
});

function readPixels(bitmap: ImageBitmap, w: number, h: number): ImageData {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
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

/**
 * Captures a rectangle of the target window (measured at its rest position) in viewport-sized
 * tiles. With `transparent`, every tile is taken on white and on black and the alpha is recovered.
 */
async function captureRect(
  s: Session,
  rect: { x: number; y: number; w: number; h: number },
  transparent: boolean,
  into?: { canvas: HTMLCanvasElement; offsetY: number; scale: number },
): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const vp = viewport();
  let canvas = into?.canvas;
  let scale = into?.scale ?? 0;
  const tilesX = Math.ceil(rect.w / vp.w);
  const tilesY = Math.ceil(rect.h / vp.h);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const ox = tx * vp.w;
      const oy = ty * vp.h;
      const tw = Math.min(vp.w, rect.w - ox);
      const th = Math.min(vp.h, rect.h - oy);
      // Slide the window so this tile of the rectangle sits at the top-left of the viewport.
      s.target.style.translate = `${-(rect.x + ox)}px ${-(rect.y + oy)}px`;
      await settle();

      let first: ImageBitmap;
      let second: ImageBitmap | undefined;
      if (transparent) {
        await setBackdrop(s, '#fff');
        first = await grab(s);
        await setBackdrop(s, '#000');
        second = await grab(s);
      } else {
        await setBackdrop(s, '#fff');
        first = await grab(s);
      }

      // Image pixels per CSS px: the tab may be zoomed, so measure instead of trusting the DPR.
      const full = first.width / window.devicePixelRatio;
      const cssW =
        Math.abs(full - window.innerWidth) < Math.abs(full - vp.w) ? window.innerWidth : vp.w;
      const sx = first.width / cssW;
      if (!canvas) {
        scale = sx;
        const wpx = Math.round(rect.w * sx);
        const hpx = Math.round(rect.h * sx);
        if (wpx > MAX_CANVAS_SIDE || hpx > MAX_CANVAS_SIDE || wpx * hpx > MAX_CANVAS_AREA) {
          throw new CaptureError('This device is too large to capture at this screen resolution.');
        }
        canvas = document.createElement('canvas');
        canvas.width = wpx;
        canvas.height = hpx;
      }
      const pw = Math.max(1, Math.round(tw * sx));
      const ph = Math.max(1, Math.round(th * sx));
      const dx = Math.round(ox * scale);
      const dy = Math.round((oy + (into?.offsetY ?? 0)) * scale);
      const ctx = canvas.getContext('2d')!;
      if (second) {
        ctx.putImageData(matte(readPixels(first, pw, ph), readPixels(second, pw, ph)), dx, dy);
        second.close();
      } else {
        ctx.drawImage(first, 0, 0, pw, ph, dx, dy, pw, ph);
      }
      first.close();
    }
  }
  return { canvas: canvas!, scale };
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

type StyleProp = 'left' | 'top' | 'width' | 'height' | 'translate' | 'scale';

interface Saved {
  el: HTMLElement;
  prop: StyleProp;
  value: string;
}

/**
 * Takes a screenshot of one device window.
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
  const scaleEl = target.querySelector<HTMLElement>('.device-scale');
  const boxEl = target.querySelector<HTMLElement>('.device-box');
  const deviceEl = target.querySelector<HTMLElement>('.device');
  const screenEl = target.querySelector<HTMLElement>('.screen');
  const iframe = target.querySelector<HTMLIFrameElement>('iframe.frame');
  if (!scaleEl || !boxEl || !deviceEl || !screenEl) {
    throw new CaptureError('The device is not ready yet. Try again in a moment.');
  }

  const host = (root as unknown as { host: Element }).host;
  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';
  const session: Session = {
    root,
    host,
    target,
    backdrop,
    lastCapture: 0,
    captures: 0,
    expected: 1,
    progress,
  };

  // Remember everything we change so it can be put back exactly.
  const saved: Saved[] = [];
  const set = (el: HTMLElement, prop: StyleProp, value: string) => {
    saved.push({ el, prop, value: el.style[prop] });
    el.style[prop] = value;
  };
  const restoreFloating: (() => void)[] = [];
  let scrollBack: (() => void) | undefined;

  try {
    // Real size, top-left, alone on a plain backdrop, no shadows or title bar.
    const boxW = scaleEl.style.width;
    const boxH = scaleEl.style.height;
    host.classList.add('capturing');
    target.setAttribute('data-capture-target', '');
    target.setAttribute('data-capture-mode', mode);
    root.append(backdrop);
    set(target, 'left', '0px');
    set(target, 'top', '0px');
    set(target, 'width', boxW);
    set(target, 'translate', '0px 0px');
    set(boxEl, 'width', boxW);
    set(boxEl, 'height', boxH);
    set(scaleEl, 'scale', '1');
    await setBackdrop(session, '#fff');

    const measure = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: Math.round(r.width), h: Math.round(r.height) };
    };

    if (mode === 'device') {
      session.expected =
        2 *
        Math.ceil(measure(deviceEl).w / viewport().w) *
        Math.ceil(measure(deviceEl).h / viewport().h);
      const { canvas } = await captureRect(session, measure(deviceEl), true);
      return { canvas, transparent: true };
    }

    if (mode === 'screen') {
      const rect = measure(screenEl);
      session.expected = Math.ceil(rect.w / viewport().w) * Math.ceil(rect.h / viewport().h);
      const { canvas } = await captureRect(session, rect, false);
      return { canvas, transparent: false };
    }

    // Full page: scroll the framed page one screen at a time and stitch.
    if (!iframe) throw new CaptureError('This device has no page to capture.');
    const rect = measure(iframe);
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      doc = null;
    }
    const win = iframe.contentWindow;
    const docEl = doc?.documentElement;
    const perScreen = Math.ceil(rect.w / viewport().w) * Math.ceil(rect.h / viewport().h);
    if (!doc || !win || !docEl) {
      session.expected = perScreen;
      const { canvas } = await captureRect(session, rect, false);
      return {
        canvas,
        transparent: false,
        note: 'This page comes from another site, so it cannot be scrolled. Only the visible part was captured.',
      };
    }

    const scrollTop = win.scrollY;
    scrollBack = () => win.scrollTo({ top: scrollTop, behavior: 'instant' });
    const pageH = Math.max(docEl.scrollHeight, doc.body?.scrollHeight ?? 0, rect.h);
    const sxGuess = window.devicePixelRatio || 1;
    const maxH = Math.max(
      rect.h,
      Math.min(
        MAX_PAGE_CSS_HEIGHT,
        Math.floor(MAX_CANVAS_SIDE / sxGuess),
        Math.floor(MAX_CANVAS_AREA / (rect.w * sxGuess * sxGuess)),
      ),
    );
    const total = Math.min(pageH, maxH);
    const steps = Math.max(1, Math.ceil(total / rect.h));
    session.expected = steps * perScreen;

    let canvas: HTMLCanvasElement | undefined;
    let scale = 0;
    for (let i = 0; i < steps; i++) {
      const y = Math.min(i * rect.h, Math.max(0, total - rect.h));
      win.scrollTo({ top: y, behavior: 'instant' });
      await sleep(SCROLL_SETTLE_MS);
      const actual = win.scrollY;
      const part = await captureRect(
        session,
        rect,
        false,
        canvas ? { canvas, offsetY: actual, scale } : undefined,
      );
      if (!canvas) {
        // The first call made a canvas sized for one screen: grow it to the whole page.
        scale = part.scale;
        const full = document.createElement('canvas');
        full.width = part.canvas.width;
        full.height = Math.round(total * scale);
        full.getContext('2d')!.drawImage(part.canvas, 0, Math.round(actual * scale));
        canvas = full;
        // The first screen keeps headers, as a visitor sees the page. After it they would
        // repeat on every screen, so hide fixed and sticky elements for the rest.
        if (steps > 1) restoreFloating.push(hideFloating(doc));
      }
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
    for (const { el, prop, value } of saved.reverse()) el.style[prop] = value;
    backdrop.remove();
    target.removeAttribute('data-capture-target');
    target.removeAttribute('data-capture-mode');
    host.classList.remove('capturing');
  }
}
