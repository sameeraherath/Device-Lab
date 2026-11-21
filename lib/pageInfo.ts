// Facts about the current page used by the device UI: theme colour, domain and clock time.

export interface StatusTheme {
  /** Status bar background. */
  background: string;
  /** Text and icon colour that stays readable on it. */
  foreground: 'dark' | 'light';
}

let cached: StatusTheme | undefined;

/** Normalises any CSS colour to [r, g, b] using a 2D canvas; null when it is not a colour. */
function toRgb(color: string): [number, number, number] | null {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#010203';
  ctx.fillStyle = color;
  const value = String(ctx.fillStyle);
  if (value === '#010203' && color.trim().toLowerCase() !== '#010203') return null;
  const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16), parseInt(hex[3]!, 16)];
  const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** The page's `<meta name="theme-color">` (light variant preferred), or white. Cached per page. */
export function statusTheme(): StatusTheme {
  if (cached) return cached;
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const meta =
    metas.find((m) => !m.media || m.media.includes('light')) ?? metas.find((m) => !m.media);
  const rgb = meta ? toRgb(meta.content) : null;
  if (!rgb) {
    cached = { background: '#ffffff', foreground: 'dark' };
    return cached;
  }
  // Relative luminance (sRGB) decides dark or light text.
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  cached = { background: `rgb(${rgb.join(', ')})`, foreground: luminance > 0.4 ? 'dark' : 'light' };
  return cached;
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
