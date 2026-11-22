// Loads and types the device list (data/devices.json), holds custom devices, and computes frame geometry.
import raw from '@/data/devices.json';
import type { ThemeSource } from './pageInfo';

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
export type BottomBarKind = 'safari' | 'safari-26' | 'gesture' | 'nav-buttons' | 'none';
/** Browser toolbar above the page: Chrome on phones and Android tablets, Safari on iPad. */
export type TopBarKind = 'chrome' | 'chrome-tablet' | 'safari-ipad';

/** Heights in CSS px. A top bar and the 3-button navigation bar take space from the page. */
export const TOP_BAR_HEIGHT: Record<TopBarKind, number> = {
  chrome: 56,
  'chrome-tablet': 96,
  'safari-ipad': 50,
};
export const NAV_BAR_HEIGHT = 48;

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
  topBar?: TopBarKind;
  /**
   * Laptop deck or smart-display base under the lid; overhang may be negative (narrower).
   * `color` is the deck's [top, bottom] gradient.
   */
  base?: { height: number; overhang: number; color?: [string, string] };
  /** Desktop monitor stand; `color` is the metal's [light, dark] gradient. */
  stand?: {
    neck: number;
    neckWidth: number;
    foot: number;
    footHeight: number;
    color?: [string, string];
  };
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
  /** Official colours, darkest (the default) first. Absent: the generic finishes apply. */
  finishes?: Finish[];
}

/** One official colour of a device, as it shows from the front. */
export interface Finish {
  id: string;
  /** The maker's official name, e.g. "Cosmic Orange". */
  name: string;
  /** Marketing colour for the picker dot. */
  swatch: string;
  /** Metal band [light, dark]; side buttons use it too. */
  rim: [string, string];
  rimHighlight?: string;
  /** Front glass colour, only when it changes with the colour (e.g. a white front). */
  bezel?: string;
  /** Laptop keyboard deck [top, bottom]. */
  base?: [string, string];
  /** Sold only in the maker's online store. */
  online?: boolean;
}

/** Neutral finishes for generic and custom devices. */
export const GENERIC_FINISHES: readonly Finish[] = [
  {
    id: 'black',
    name: 'Black',
    swatch: '#2b2c2f',
    rim: ['#4f5054', '#1c1d1f'],
    rimHighlight: '#7d7f84',
  },
  {
    id: 'silver',
    name: 'Silver',
    swatch: '#d9dadc',
    rim: ['#d6d8db', '#9c9fa4'],
    rimHighlight: '#eff0f2',
  },
  {
    id: 'space-gray',
    name: 'Space Gray',
    swatch: '#7d7e82',
    rim: ['#8a8b8f', '#4e4f53'],
    rimHighlight: '#b3b4b8',
  },
];

/** The colours a device can be shown in (its official ones, or the generic set). */
export function finishesOf(device: Device): readonly Finish[] {
  return device.finishes?.length ? device.finishes : GENERIC_FINISHES;
}

/** A frame preset recoloured with a finish; everything else stays the same. */
export function withFinish(
  frame: FramePreset | null,
  finish: Finish | undefined,
): FramePreset | null {
  if (!frame || !finish) return frame;
  return {
    ...frame,
    // Frames drawn without a metal band (e.g. a plain monitor) stay without one.
    rim: frame.rim ? finish.rim : undefined,
    rimHighlight: frame.rim ? (finish.rimHighlight ?? frame.rimHighlight) : frame.rimHighlight,
    color: finish.bezel ?? frame.color,
    base: frame.base && finish.base ? { ...frame.base, color: finish.base } : frame.base,
  };
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
  /** Browser toolbar above the page, and the 3-button navigation bar below it (0 when none). */
  topBarH: number;
  navBarH: number;
  /** The page viewport: the screen minus the status bar and the bars that take page space. */
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
 * Screen corner radii: the display's own radius (`screenRadius`, measured from the real device),
 * capped per axis at the frame radius minus the bezel on that side, so the bezel is never thinner
 * at a corner than along the edges. Uneven bezels (a tall chin or forehead) can then give
 * elliptical or square corners, like the real devices.
 * Returns a CSS `border-radius` value: "TL TR BR BL / TL TR BR BL" (horizontal / vertical).
 */
export function screenCornerRadii(
  frame: FramePreset,
  bezel: { t: number; r: number; b: number; l: number },
): string {
  const nest = (side: number) =>
    `${Math.max(0, Math.min(frame.screenRadius, frame.radius - side))}px`;
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
      topBarH: 0,
      navBarH: 0,
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
  const topBarH = frame.topBar ? TOP_BAR_HEIGHT[frame.topBar] : 0;
  const navBarH = frame.bottomBar === 'nav-buttons' ? NAV_BAR_HEIGHT : 0;

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
    topBarH,
    navBarH,
    viewportW: screenW,
    viewportH: screenH - statusH - topBarH - navBarH,
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

/** Where a frame's bars take their colour from (see `ThemeSource`). */
export function themeSource(frame: FramePreset | null): ThemeSource {
  if (frame?.bottomBar === 'safari-26' || frame?.topBar === 'safari-ipad') return 'page';
  if (frame?.statusBar?.startsWith('ios')) return 'safari';
  return 'chrome';
}
