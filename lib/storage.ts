// Typed wrappers around browser.storage.local; the only stored key is the last used device.
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
