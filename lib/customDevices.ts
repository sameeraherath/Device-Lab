// Custom devices: validation, and persistence in browser.storage.local (max 20).
import { CUSTOM_FRAME, type CustomType, type Device } from './devices';

export const CUSTOM_LIMIT = 20;
export const NAME_MAX = 40;
export const SIZE_MIN = 240;
export const SIZE_MAX = 3840;
export const DPR_MIN = 1;
export const DPR_MAX = 4;
const STORAGE_KEY = 'customDevices';
const TYPES: readonly CustomType[] = ['phone', 'tablet', 'laptop', 'desktop'];

export interface CustomDeviceInput {
  name: string;
  width: number;
  height: number;
  dpr: number;
  type: CustomType;
  showFrame: boolean;
}

/** Returns an error message, or null when the input is valid. */
export function validateCustomDevice(input: CustomDeviceInput): string | null {
  const name = input.name.trim();
  if (!name) return 'Enter a name.';
  if (name.length > NAME_MAX) return `Use at most ${NAME_MAX} characters for the name.`;
  for (const [label, value] of [
    ['Width', input.width],
    ['Height', input.height],
  ] as const) {
    if (!Number.isInteger(value) || value < SIZE_MIN || value > SIZE_MAX) {
      return `${label} must be a whole number from ${SIZE_MIN} to ${SIZE_MAX}.`;
    }
  }
  if (!Number.isFinite(input.dpr) || input.dpr < DPR_MIN || input.dpr > DPR_MAX) {
    return `DPR must be from ${DPR_MIN} to ${DPR_MAX}.`;
  }
  if (!TYPES.includes(input.type)) return 'Choose a type.';
  return null;
}

function toDevice(id: string, input: CustomDeviceInput): Device {
  return {
    id,
    name: input.name.trim(),
    group: 'custom',
    family: 'custom',
    width: input.width,
    height: input.height,
    dpr: input.dpr,
    type: input.type,
    showFrame: input.showFrame,
    frame: CUSTOM_FRAME[input.type],
  };
}

/** Turns whatever is in storage into valid devices; anything malformed is dropped. */
function sanitize(value: unknown): Device[] {
  if (!Array.isArray(value)) return [];
  const result: Device[] = [];
  for (const item of value) {
    if (result.length >= CUSTOM_LIMIT) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id.startsWith('custom-')) continue;
    const input: CustomDeviceInput = {
      name: typeof r.name === 'string' ? r.name : '',
      width: Number(r.width),
      height: Number(r.height),
      dpr: r.dpr === undefined ? 1 : Number(r.dpr),
      type: r.type as CustomType,
      showFrame: r.showFrame !== false,
    };
    if (validateCustomDevice(input) === null) result.push(toDevice(r.id, input));
  }
  return result;
}

export async function loadCustomDevices(): Promise<Device[]> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return sanitize(stored[STORAGE_KEY]);
  } catch {
    return [];
  }
}

async function save(list: Device[]): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEY]: list.map(({ id, name, width, height, dpr, type, showFrame }) => ({
      id,
      name,
      width,
      height,
      dpr,
      type,
      showFrame,
    })),
  });
}

/** Adds a device; returns the new list. Throws with a readable message on invalid input or limit. */
export async function addCustomDevice(input: CustomDeviceInput): Promise<Device[]> {
  const error = validateCustomDevice(input);
  if (error) throw new Error(error);
  const list = await loadCustomDevices();
  if (list.length >= CUSTOM_LIMIT)
    throw new Error(`Limit of ${CUSTOM_LIMIT} custom devices reached.`);
  const next = [...list, toDevice(`custom-${crypto.randomUUID()}`, input)];
  await save(next);
  return next;
}

export async function updateCustomDevice(id: string, input: CustomDeviceInput): Promise<Device[]> {
  const error = validateCustomDevice(input);
  if (error) throw new Error(error);
  const list = await loadCustomDevices();
  const next = list.map((d) => (d.id === id ? toDevice(id, input) : d));
  await save(next);
  return next;
}

export async function deleteCustomDevice(id: string): Promise<Device[]> {
  const next = (await loadCustomDevices()).filter((d) => d.id !== id);
  await save(next);
  return next;
}

/** Calls back with the new list whenever custom devices change (in any tab). Returns a stop function. */
export function watchCustomDevices(callback: (list: Device[]) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && STORAGE_KEY in changes)
      callback(sanitize(changes[STORAGE_KEY]?.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
