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
  background: ShotBackground;
  /** Colour used when `background` is "custom" (a #rrggbb value). */
  color: string;
  padding: ShotPadding;
}

export const DEFAULT_SHOT_PREFS: ScreenshotPrefs = {
  mode: 'device',
  format: 'png',
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
    return {
      mode: pick(raw.mode, ['device', 'screen', 'page', 'background'], DEFAULT_SHOT_PREFS.mode),
      format: pick(raw.format, ['png', 'jpeg', 'webp'], DEFAULT_SHOT_PREFS.format),
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

// ---- Recording settings (the Record menu) ----
export type RecordMode = 'device' | 'camera';
export type RecordQuality = 'good' | 'better' | 'best';
export type ScrollSpeed = 'slow' | 'medium' | 'fast';
export type CameraCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type CameraSize = 'small' | 'medium' | 'large';

export interface RecordPrefs {
  /** What goes in the video: the device alone, or the device with a camera bubble. */
  mode: RecordMode;
  mic: boolean;
  pageAudio: boolean;
  autoScroll: boolean;
  scrollSpeed: ScrollSpeed;
  quality: RecordQuality;
  /** Seconds counted down before recording starts (0 starts at once). */
  countdown: number;
  transparent: boolean;
  fps: 30 | 60;
  cameraCorner: CameraCorner;
  cameraSize: CameraSize;
  /** Whether the "More settings" section is open. */
  moreOpen: boolean;
}

export const DEFAULT_RECORD_PREFS: RecordPrefs = {
  mode: 'device',
  mic: false,
  pageAudio: false,
  autoScroll: false,
  scrollSpeed: 'medium',
  quality: 'good',
  countdown: 3,
  transparent: false,
  fps: 30,
  cameraCorner: 'bottom-right',
  cameraSize: 'medium',
  moreOpen: false,
};

export const MAX_COUNTDOWN = 10;
const RECORD_KEY = 'recordPrefs';

/** The last recording choices; anything missing or malformed falls back to the defaults. */
export async function getRecordPrefs(): Promise<RecordPrefs> {
  const d = DEFAULT_RECORD_PREFS;
  try {
    const raw = (await browser.storage.local.get(RECORD_KEY))[RECORD_KEY] as
      Partial<Record<keyof RecordPrefs, unknown>> | undefined;
    if (!raw || typeof raw !== 'object') return d;
    const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
    return {
      mode: pick(raw.mode, ['device', 'camera'], d.mode),
      mic: bool(raw.mic, d.mic),
      pageAudio: bool(raw.pageAudio, d.pageAudio),
      autoScroll: bool(raw.autoScroll, d.autoScroll),
      scrollSpeed: pick(raw.scrollSpeed, ['slow', 'medium', 'fast'], d.scrollSpeed),
      quality: pick(raw.quality, ['good', 'better', 'best'], d.quality),
      countdown:
        typeof raw.countdown === 'number' && Number.isFinite(raw.countdown)
          ? Math.min(MAX_COUNTDOWN, Math.max(0, Math.round(raw.countdown)))
          : d.countdown,
      transparent: bool(raw.transparent, d.transparent),
      fps: raw.fps === 60 ? 60 : 30,
      cameraCorner: pick(
        raw.cameraCorner,
        ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        d.cameraCorner,
      ),
      cameraSize: pick(raw.cameraSize, ['small', 'medium', 'large'], d.cameraSize),
      moreOpen: bool(raw.moreOpen, d.moreOpen),
    };
  } catch {
    return d;
  }
}

export async function setRecordPrefs(prefs: RecordPrefs): Promise<void> {
  try {
    await browser.storage.local.set({ [RECORD_KEY]: prefs });
  } catch {
    // Storage is a convenience only; ignore failures.
  }
}
