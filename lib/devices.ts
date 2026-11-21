// Loads and types the device list (data/devices.json), holds custom devices, and computes frame geometry.
import raw from '@/data/devices.json';

export type DeviceGroup = 'custom' | 'phones' | 'foldables' | 'tablets' | 'computers' | 'displays';
/** Frame style for a custom device. */
export type CustomType = 'phone' | 'tablet' | 'laptop' | 'desktop';

export interface Cutout {
  shape: 'island' | 'notch' | 'punch';
  width: number;
  height: number;
  /** Distance from the screen's top edge (portrait). */
  offset: number;
}

/** All lengths are CSS px at device scale (before the window's fit-to-viewport scale). */
export interface FramePreset {
  radius: number;
  bezel: number;
  bezelTop?: number;
  bezelBottom?: number;
  screenRadius: number;
  color: string;
  cutout?: Cutout;
  homeButton?: boolean;
  /** Laptop deck or smart-display base under the lid; overhang may be negative (narrower). */
  base?: { height: number; overhang: number };
  /** Desktop monitor stand. */
  stand?: { neck: number; neckWidth: number; foot: number; footHeight: number };
}

export interface Device {
  id: string;
  name: string;
  group: DeviceGroup;
  /** CSS px as listed (portrait for phones/foldables/tablets, landscape for computers/displays). */
  width: number;
  height: number;
  dpr: number;
  /** Key into the frame presets. */
  frame: string;
  note?: string;
  /** Custom devices only. */
  type?: CustomType;
  showFrame?: boolean;
}

interface DeviceData {
  frames: Record<string, FramePreset>;
  devices: Device[];
}

const data = raw as DeviceData;
export const FRAME_PRESETS = data.frames;
export const builtInDevices: readonly Device[] = data.devices;

export const GROUPS: { id: DeviceGroup; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'phones', label: 'Phones' },
  { id: 'foldables', label: 'Foldables' },
  { id: 'tablets', label: 'Tablets' },
  { id: 'computers', label: 'Laptops & Desktops' },
  { id: 'displays', label: 'Smart displays' },
];

const FIRST = builtInDevices[0] as Device;
/** The first device in the list; used as the default and as the fallback for missing devices. */
export const FIRST_DEVICE_ID = FIRST.id;
export const DEFAULT_DEVICE_ID = FIRST_DEVICE_ID;

/** Frame used for each custom device type: the matching style without any cutout. */
export const CUSTOM_FRAME: Record<CustomType, string> = {
  phone: 'simple-phone',
  tablet: 'tablet',
  laptop: 'laptop',
  desktop: 'desktop',
};

let customDevices: readonly Device[] = [];

export function setCustomDevices(list: readonly Device[]) {
  customDevices = list;
}

export function getCustomDevices(): readonly Device[] {
  return customDevices;
}

export function allDevices(): readonly Device[] {
  return [...customDevices, ...builtInDevices];
}

export function hasDevice(id: string | undefined): id is string {
  return id !== undefined && allDevices().some((d) => d.id === id);
}

export function getDevice(id: string): Device {
  return customDevices.find((d) => d.id === id) ?? builtInDevices.find((d) => d.id === id) ?? FIRST;
}

/** Laptops, desktops and smart displays do not rotate. */
export function canRotate(device: Device): boolean {
  if (device.group === 'custom') return device.type === 'phone' || device.type === 'tablet';
  return device.group === 'phones' || device.group === 'foldables' || device.group === 'tablets';
}

/** The frame to draw, or null when the device has its frame switched off. */
export function getFrame(device: Device): FramePreset | null {
  if (device.showFrame === false) return null;
  return FRAME_PRESETS[device.frame] ?? null;
}

export interface FrameLayout {
  /** Screen (iframe) size in CSS px. */
  screenW: number;
  screenH: number;
  /** Bezels around the screen, after rotation. */
  bezel: { t: number; r: number; b: number; l: number };
  /** The lid: screen plus bezels. */
  lidW: number;
  lidH: number;
  /** Optional base under the lid. */
  baseW: number;
  baseH: number;
  /** Optional monitor stand. */
  standH: number;
  /** Outer size of the whole device. */
  width: number;
  height: number;
}

/** Computes the size of every part of a device for the given rotation. */
export function frameLayout(device: Device, rotated: boolean): FrameLayout {
  const turned = rotated && canRotate(device);
  const screenW = turned ? device.height : device.width;
  const screenH = turned ? device.width : device.height;
  const frame = getFrame(device);
  if (!frame) {
    const bezel = { t: 0, r: 0, b: 0, l: 0 };
    return {
      screenW,
      screenH,
      bezel,
      lidW: screenW,
      lidH: screenH,
      baseW: 0,
      baseH: 0,
      standH: 0,
      width: screenW,
      height: screenH,
    };
  }
  const top = frame.bezelTop ?? frame.bezel;
  const bottom = frame.bezelBottom ?? frame.bezel;
  // Rotating a phone a quarter turn moves its top edge to the left.
  const bezel = turned
    ? { t: frame.bezel, r: bottom, b: frame.bezel, l: top }
    : { t: top, r: frame.bezel, b: bottom, l: frame.bezel };
  const lidW = screenW + bezel.l + bezel.r;
  const lidH = screenH + bezel.t + bezel.b;
  const baseW = frame.base ? lidW + 2 * frame.base.overhang : 0;
  const baseH = frame.base?.height ?? 0;
  const standH = frame.stand ? frame.stand.neck + frame.stand.footHeight : 0;
  const width = Math.max(lidW, baseW, frame.stand?.foot ?? 0);
  const height = lidH + baseH + standH;
  return { screenW, screenH, bezel, lidW, lidH, baseW, baseH, standH, width, height };
}
