// Loads data/devices.json and defines the Device type used across the extension.
import raw from '@/data/devices.json';

export type DeviceType = 'phone' | 'tablet' | 'laptop';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  /** CSS pixels in portrait. */
  width: number;
  height: number;
  pixelRatio: number;
}

export const devices = raw as Device[];
const FALLBACK = devices[0] as Device;
export const DEFAULT_DEVICE_ID = FALLBACK.id;

export function getDevice(id: string): Device {
  return devices.find((d) => d.id === id) ?? FALLBACK;
}
