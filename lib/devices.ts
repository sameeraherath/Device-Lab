// Loads and types the device list (data/devices.json), holds custom devices, and computes frame geometry.
import raw from '@/data/devices.json';

export type DeviceGroup = 'custom' | 'phones' | 'foldables' | 'tablets' | 'computers' | 'displays';
/** How the picker sections devices (phones are split by maker). */
export type DeviceFamily =
  | 'custom'
  | 'iphone'
  | 'pixel'
  | 'samsung'
  | 'moto'
  | 'other-phones'
  | 'foldables'
  | 'tablets'
  | 'computers'
  | 'displays';
/** Frame style for a custom device. */
export type CustomType = 'phone' | 'tablet' | 'laptop' | 'desktop';

export interface Cutout {
  shape: 'island' | 'notch' | 'punch';
  width: number;
  height: number;
  /** Distance from the screen's top edge (portrait). */
  offset: number;
}

export type StatusBarKind =
  'ios-island' | 'ios-notch' | 'ios-classic' | 'android' | 'tablet' | 'none';
export type BottomBarKind = 'safari' | 'gesture' | 'none';

/** A hardware button on the frame edge; a negative `start` is measured from the far end. */
export interface HardwareButton {
  side: 'left' | 'right' | 'top';
  start: number;
  length: number;
}

/** All lengths are CSS px at device scale (before the window's fit-to-viewport scale). */
export interface FramePreset {
  radius: number;
  /** Total bezel thickness, including the metal rim. */
  bezel: number;
  bezelTop?: number;
  bezelBottom?: number;
  screenRadius: number;
  /** Bezel (glass border) colour. */
  color: string;
  /** Metal rim gradient [light, dark] and its width. */
  rim?: [string, string];
  /** Fine highlight line just inside the metal band. */
  rimHighlight?: string;
  rimWidth?: number;
  cutout?: Cutout;
  homeButton?: boolean;
  buttons?: HardwareButton[];
  statusBar?: StatusBarKind;
  statusBarHeight?: number;
  bottomBar?: BottomBarKind;
  /** Laptop deck or smart-display base under the lid; overhang may be negative (narrower). */
  base?: { height: number; overhang: number };
  /** Desktop monitor stand. */
  stand?: { neck: number; neckWidth: number; foot: number; footHeight: number };
}

export interface Device {
  id: string;
  name: string;
  group: DeviceGroup;
  family: DeviceFamily;
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

// Shape is guaranteed by the generator that writes devices.json.
const data = raw as unknown as DeviceData;
export const FRAME_PRESETS = data.frames;
export const builtInDevices: readonly Device[] = data.devices;

export const FAMILIES: { id: DeviceFamily; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'iphone', label: 'iPhone' },
  { id: 'pixel', label: 'Google Pixel' },
  { id: 'samsung', label: 'Samsung Galaxy' },
  { id: 'moto', label: 'Motorola' },
  { id: 'other-phones', label: 'Other phones' },
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

/** How far hardware buttons stick out of the frame. */
export const BUTTON_DEPTH = 3;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayout {
  /** Screen size in CSS px (the listed device size, after rotation). */
  screenW: number;
  screenH: number;
  /** Status bar height reserved at the top of the screen (0 when rotated or none). */
  statusH: number;
  /** The page viewport: the screen minus the status bar. */
  viewportW: number;
  viewportH: number;
  /** Space around the lid for hardware buttons. */
  pad: number;
  /** Hardware buttons, in the coordinates of the lid wrapper (lid plus `pad`). */
  buttons: Rect[];
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

/**
 * Screen corner radii that nest inside the frame: the frame radius minus the bezel on each side,
 * per axis, so the bezel is equally thick all the way round every corner. Uneven bezels (a tall
 * chin or forehead) give elliptical or square corners, like the real devices.
 * Returns a CSS `border-radius` value: "TL TR BR BL / TL TR BR BL" (horizontal / vertical).
 */
export function screenCornerRadii(
  frame: FramePreset,
  bezel: { t: number; r: number; b: number; l: number },
): string {
  const nest = (side: number) => `${Math.max(0, frame.radius - side)}px`;
  const [l, r, t, b] = [nest(bezel.l), nest(bezel.r), nest(bezel.t), nest(bezel.b)];
  return `${l} ${r} ${r} ${l} / ${t} ${t} ${b} ${b}`;
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
      statusH: 0,
      viewportW: screenW,
      viewportH: screenH,
      pad: 0,
      buttons: [],
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
  // Landscape phones hide the status bar.
  const statusH = turned ? 0 : (frame.statusBarHeight ?? 0);

  // Buttons are laid out on the portrait lid, then turned with it (top edge -> left edge).
  const pad = frame.buttons?.length ? BUTTON_DEPTH : 0;
  const portraitW = (turned ? lidH : lidW) + 2 * pad;
  const portraitLidW = turned ? lidH : lidW;
  const portraitLidH = turned ? lidW : lidH;
  const buttons = (frame.buttons ?? []).map((b): Rect => {
    const along = b.side === 'top' ? portraitLidW : portraitLidH;
    const start = pad + (b.start >= 0 ? b.start : along + b.start - b.length);
    const rect: Rect =
      b.side === 'left'
        ? { x: 0, y: start, w: pad + 1, h: b.length }
        : b.side === 'right'
          ? { x: pad + portraitLidW - 1, y: start, w: pad + 1, h: b.length }
          : { x: start, y: 0, w: b.length, h: pad + 1 };
    // Quarter turn counter-clockwise: (x, y) -> (y, W - x).
    return turned ? { x: rect.y, y: portraitW - rect.x - rect.w, w: rect.h, h: rect.w } : rect;
  });

  const baseW = frame.base ? lidW + 2 * frame.base.overhang : 0;
  const baseH = frame.base?.height ?? 0;
  const standH = frame.stand ? frame.stand.neck + frame.stand.footHeight : 0;
  const width = Math.max(lidW + 2 * pad, baseW, frame.stand?.foot ?? 0);
  const height = lidH + 2 * pad + baseH + standH;
  return {
    screenW,
    screenH,
    statusH,
    viewportW: screenW,
    viewportH: screenH - statusH,
    pad,
    buttons,
    bezel,
    lidW,
    lidH,
    baseW,
    baseH,
    standH,
    width,
    height,
  };
}
