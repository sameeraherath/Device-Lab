// A tiny line drawing of a device for the picker cards: shape, cutout and base drawn from the frame data.
import { getFrame, type Device } from '@/lib/devices';

interface Thumb {
  w: number;
  h: number;
  radius: number;
  cut: 'island' | 'notch' | 'punch' | 'home' | 'hinge' | 'none';
  base: number;
  dock: number;
  stand: boolean;
}

/** Sizes for the drawing. Portrait devices are 56 tall (tablets 52); landscape ones are 64 wide. */
export function thumbMetrics(device: Device): Thumb {
  const frame = getFrame(device);
  const landscape = device.width > device.height;
  const tablet = device.family === 'tablets' || device.frame === 'dual-screen';
  let w: number;
  let h: number;
  if (landscape) {
    w = device.group === 'displays' ? 58 : 64;
    h = Math.max(24, Math.round((w * device.height) / device.width));
  } else {
    h = tablet ? 52 : 56;
    w = Math.max(20, Math.round((h * device.width) / device.height));
  }
  let cut: Thumb['cut'] = 'none';
  if (device.frame === 'dual-screen') cut = 'hinge';
  else if (frame?.homeButton) cut = 'home';
  else if (frame?.cutout) cut = frame.cutout.shape;
  const baseOverhang = frame?.base?.overhang ?? 0;
  return {
    w,
    h,
    radius: frame ? Math.max(3, Math.min(9, Math.round(frame.radius * 0.13))) : 3,
    cut,
    base: frame?.base && baseOverhang >= 0 ? w + 12 : 0,
    dock: frame?.base && baseOverhang < 0 ? Math.round(w * 0.7) : 0,
    stand: !!frame?.stand,
  };
}

export function DeviceThumb({ device }: { device: Device }) {
  const t = thumbMetrics(device);
  return (
    <span class="thumb" aria-hidden="true">
      <span
        class="thumb-sil"
        style={{ width: `${t.w}px`, height: `${t.h}px`, borderRadius: `${t.radius}px` }}
      >
        {t.cut !== 'none' && <span class={`thumb-cut thumb-${t.cut}`} />}
      </span>
      {t.base > 0 && <span class="thumb-base" style={{ width: `${t.base}px` }} />}
      {t.dock > 0 && <span class="thumb-dock" style={{ width: `${t.dock}px` }} />}
      {t.stand && (
        <>
          <span class="thumb-neck" />
          <span class="thumb-foot" />
        </>
      )}
    </span>
  );
}
