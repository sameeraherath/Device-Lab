// Typed wrappers around browser.storage.local: the last used device and the Focus mode setting.
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
