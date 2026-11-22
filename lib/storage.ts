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
