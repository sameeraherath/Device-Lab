// Typed wrappers around browser.storage.local: last used device, recent devices and Focus mode.
const LAST_DEVICE_KEY = 'lastDeviceId';

export async function getLastDeviceId(): Promise<string | undefined> {
  try {
    const result = await browser.storage.local.get(LAST_DEVICE_KEY);
    const value = result[LAST_DEVICE_KEY];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function setLastDeviceId(id: string): Promise<void> {
  try {
    await browser.storage.local.set({ [LAST_DEVICE_KEY]: id });
  } catch {
    // Storage is a convenience only; ignore failures.
  }
}

const STAGE_KEY = 'stageOn';

/** Focus mode (dark stage behind the devices); off unless the user turned it on. */
export async function getStageOn(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(STAGE_KEY);
    return typeof result[STAGE_KEY] === 'boolean' ? result[STAGE_KEY] : false;
  } catch {
    return false;
  }
}

export async function setStageOn(on: boolean): Promise<void> {
  try {
    await browser.storage.local.set({ [STAGE_KEY]: on });
  } catch {
    // Storage is a convenience only; ignore failures.
  }
}

const RECENT_KEY = 'recentDevices';
export const RECENT_LIMIT = 4;

/** The most recently chosen device ids, newest first. */
export async function getRecentDevices(): Promise<string[]> {
  try {
    const result = await browser.storage.local.get(RECENT_KEY);
    const value = result[RECENT_KEY];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Puts a device first in the recent list (no duplicates, at most RECENT_LIMIT); returns the list. */
export async function pushRecentDevice(id: string): Promise<string[]> {
  const next = [id, ...(await getRecentDevices()).filter((v) => v !== id)].slice(0, RECENT_LIMIT);
  try {
    await browser.storage.local.set({ [RECENT_KEY]: next });
  } catch {
    // Storage is a convenience only; ignore failures.
  }
  return next;
}

const FINISH_KEY = 'deviceFinishes';

/** The colour chosen for each device: device id -> finish id. */
export async function getFinishChoices(): Promise<Record<string, string>> {
  try {
    const value = (await browser.storage.local.get(FINISH_KEY))[FINISH_KEY];
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

export async function setFinishChoices(choices: Record<string, string>): Promise<void> {
  try {
    await browser.storage.local.set({ [FINISH_KEY]: choices });
  } catch {
    // Storage is a convenience only; ignore failures.
  }
}

export type ShotMode = 'device' | 'screen' | 'page' | 'background';
export type ShotFormat = 'png' | 'jpeg' | 'webp';
export type ShotBackground = 'transparent' | 'white' | 'black' | 'custom';
export type ShotPadding = 'none' | 'small' | 'medium' | 'large';

export interface ScreenshotPrefs {
  mode: ShotMode;
  format: ShotFormat;
  /** JPEG and WebP quality, 40 to 100. */
  quality: number;
  background: ShotBackground;
  /** Colour used when `background` is "custom" (a #rrggbb value). */
  color: string;
  padding: ShotPadding;
}

export const DEFAULT_SHOT_PREFS: ScreenshotPrefs = {
  mode: 'device',
  format: 'png',
  quality: 92,
  background: 'transparent',
  color: '#e8eaed',
  padding: 'medium',
};

const SHOT_KEY = 'screenshotPrefs';
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** The last screenshot choices; anything missing or malformed falls back to the defaults. */
export async function getScreenshotPrefs(): Promise<ScreenshotPrefs> {
  try {
    const raw = (await browser.storage.local.get(SHOT_KEY))[SHOT_KEY] as
      Partial<Record<keyof ScreenshotPrefs, unknown>> | undefined;
    if (!raw || typeof raw !== 'object') return DEFAULT_SHOT_PREFS;
    const q = Number(raw.quality);
    return {
      mode: pick(raw.mode, ['device', 'screen', 'page', 'background'], DEFAULT_SHOT_PREFS.mode),
      format: pick(raw.format, ['png', 'jpeg', 'webp'], DEFAULT_SHOT_PREFS.format),
      quality: Number.isFinite(q)
        ? Math.max(40, Math.min(100, Math.round(q)))
        : DEFAULT_SHOT_PREFS.quality,
      background: pick(
        raw.background,
        ['transparent', 'white', 'black', 'custom'],
        DEFAULT_SHOT_PREFS.background,
      ),
      color:
        typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)
          ? raw.color
          : DEFAULT_SHOT_PREFS.color,
      padding: pick(raw.padding, ['none', 'small', 'medium', 'large'], DEFAULT_SHOT_PREFS.padding),
    };
  } catch {
    return DEFAULT_SHOT_PREFS;
  }
}

export async function setScreenshotPrefs(prefs: ScreenshotPrefs): Promise<void> {
  try {
    await browser.storage.local.set({ [SHOT_KEY]: prefs });
  } catch {
    // Storage is a convenience only; ignore failures.
  }
}
