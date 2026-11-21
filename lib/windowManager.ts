// Tracks open device windows, their z-order (focus/stacking) and the last used device.
import { DEFAULT_DEVICE_ID } from './devices';
import { setLastDeviceId } from './storage';

export interface DeviceWindowState {
  id: number;
  deviceId: string;
  rotated: boolean;
  minimized: boolean;
  x: number;
  y: number;
  z: number;
}

export const MAX_WINDOWS = 3;
/** Width reserved on the right edge for the icon bar. */
export const BAR_WIDTH = 48;
const CASCADE_OFFSET = 32;
const MARGIN = 16;

let windows: DeviceWindowState[] = [];
let nextId = 1;
let zCounter = 1;
let lastDeviceId = DEFAULT_DEVICE_ID;
let onEmpty: (() => void) | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function setWindows(next: DeviceWindowState[]) {
  windows = next;
  emit();
  if (next.length === 0) onEmpty?.();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Called when the last window closes, so the UI can tear itself down. */
export function setOnEmpty(cb: (() => void) | undefined) {
  onEmpty = cb;
}

/** Tells subscribers the viewport changed, so windows re-scale and re-clamp. */
export function notifyResize() {
  emit();
}

export function getWindows(): readonly DeviceWindowState[] {
  return windows;
}

export function getLastDevice(): string {
  return lastDeviceId;
}

export function setLastDevice(id: string) {
  lastDeviceId = id;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Opens a window; returns false when the limit is reached. */
export function open(deviceId: string = lastDeviceId): boolean {
  if (windows.length >= MAX_WINDOWS) return false;
  const step = windows.length * CASCADE_OFFSET;
  const win: DeviceWindowState = {
    id: nextId++,
    deviceId,
    rotated: false,
    minimized: false,
    x: MARGIN + step,
    y: MARGIN + step,
    z: ++zCounter,
  };
  lastDeviceId = deviceId;
  setWindows([...windows, win]);
  return true;
}

/** Closes one window; the others are not touched. */
export function close(id: number) {
  setWindows(windows.filter((w) => w.id !== id));
}

/** Closes every window (and so tears the UI down). */
export function closeAll() {
  setWindows([]);
}

export function update(id: number, patch: Partial<Omit<DeviceWindowState, 'id'>>) {
  if (patch.deviceId) {
    lastDeviceId = patch.deviceId;
    void setLastDeviceId(patch.deviceId);
  }
  setWindows(windows.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

export function bringToFront(id: number) {
  const top = Math.max(...windows.map((w) => w.z));
  const target = windows.find((w) => w.id === id);
  if (!target || target.z === top) return;
  update(id, { z: ++zCounter });
}

/** Brings the topmost window forward; used when "+" is pressed at the limit. */
export function raiseTop() {
  if (windows.length === 0) return;
  const top = windows.reduce((a, b) => (a.z > b.z ? a : b));
  bringToFront(top.id);
}
