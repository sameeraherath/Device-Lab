// Facts about the current page used by the device UI: bar colours, domain and clock time.

export interface StatusTheme {
  /** Bar background (status bar and browser toolbar). */
  background: string;
  /** Text and icon colour that stays readable on it. */
  foreground: 'dark' | 'light';
}

/**
 * Where a device's bars get their colour from:
 * - `page`: the page's own background (Safari 26 and iPadOS 26 ignore `theme-color`).
 * - `safari`: `theme-color`, then the page background (Safari up to iOS 18).
 * - `chrome`: `theme-color`, then Chrome's light or dark default.
 */
export type ThemeSource = 'page' | 'safari' | 'chrome';

type Rgba = [number, number, number, number];

/** Any CSS colour to [r, g, b, a] by painting one pixel; null when it is not a colour. */
function toRgba(color: string): Rgba | null {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#010203';
  ctx.fillStyle = color;
  if (String(ctx.fillStyle) === '#010203' && color.trim().toLowerCase() !== '#010203') return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!, a! / 255];
}

function themeFrom([r, g, b]: Rgba): StatusTheme {
  // Relative luminance (sRGB) decides dark or light text.
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  return { background: `rgb(${r}, ${g}, ${b})`, foreground: luminance > 0.4 ? 'dark' : 'light' };
}

/** The `<meta name="theme-color">` that matches the viewer's colour scheme, if any. */
function themeColor(doc: Document): Rgba | null {
  const metas = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const meta =
    metas.find((m) => m.media && matchMedia(m.media).matches) ?? metas.find((m) => !m.media);
  const rgba = meta ? toRgba(meta.content) : null;
  return rgba && rgba[3] > 0.5 ? rgba : null;
}

/** The page's own background: `html`, then `body`, skipping transparent ones. White if neither. */
function pageBackground(doc: Document): Rgba {
  const view = doc.defaultView;
  for (const el of [doc.documentElement, doc.body]) {
    if (!el || !view) continue;
    const rgba = toRgba(view.getComputedStyle(el).backgroundColor);
    if (rgba && rgba[3] > 0.5) return rgba;
  }
  return [255, 255, 255, 1];
}

/** Chrome's own toolbar colour when the page sets none. */
function chromeDefault(): Rgba {
  return matchMedia('(prefers-color-scheme: dark)').matches ? [31, 31, 31, 1] : [255, 255, 255, 1];
}

/** Colours for the status bar and browser toolbar, read from the (framed) page `doc`. */
export function pageTheme(doc: Document, source: ThemeSource): StatusTheme {
  try {
    if (source === 'page') return themeFrom(pageBackground(doc));
    const fromMeta = themeColor(doc);
    if (fromMeta) return themeFrom(fromMeta);
    return themeFrom(source === 'chrome' ? chromeDefault() : pageBackground(doc));
  } catch {
    return themeFrom([255, 255, 255, 1]);
  }
}

/**
 * The colour behind the page: its own background, or white. Used behind the screen, so that the
 * partly covered pixels at the page's edges blend with the page itself and never show as a line.
 */
export function pageCanvas(doc: Document): string {
  try {
    const [r, g, b] = pageBackground(doc);
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return '#fff';
  }
}

/** Domain shown in the browser bar, without "www.". */
export function pageDomain(): string {
  return location.hostname.replace(/^www\./, '');
}

/** Time as a phone shows it, e.g. "9:50" (no AM/PM). Read once per render; no timers. */
export function clockTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  return `${hour}:${minute}`;
}
