// Draws a device frame (bezels, cutout, home button, laptop base, monitor stand) with CSS only.
import type { ComponentChildren } from 'preact';
import { canRotate, frameLayout, getFrame, type Device } from '@/lib/devices';

const px = (n: number) => `${n}px`;

interface Props {
  device: Device;
  rotated: boolean;
  children: ComponentChildren;
}

export function DeviceFrame({ device, rotated, children }: Props) {
  const frame = getFrame(device);
  const layout = frameLayout(device, rotated);
  const { screenW, screenH, bezel } = layout;

  // "Show frame" off: just the screen.
  if (!frame) {
    return (
      <div
        class="device"
        data-preset="none"
        style={{ width: px(layout.width), height: px(layout.height) }}
      >
        <div class="screen bare" style={{ width: px(screenW), height: px(screenH) }}>
          {children}
        </div>
      </div>
    );
  }

  const turned = rotated && canRotate(device);

  // Cutout: centred on the top edge in portrait; on the left edge, vertically centred, when rotated.
  let cutoutStyle: Record<string, string> | null = null;
  if (frame.cutout) {
    const c = frame.cutout;
    const r = Math.min(c.width, c.height) / 2;
    const radius =
      c.shape === 'notch' ? (turned ? `0 ${px(r)} ${px(r)} 0` : `0 0 ${px(r)} ${px(r)}`) : '999px';
    cutoutStyle = turned
      ? {
          left: px(bezel.l + c.offset),
          top: px(bezel.t + (screenH - c.width) / 2),
          width: px(c.height),
          height: px(c.width),
          borderRadius: radius,
        }
      : {
          left: px(bezel.l + (screenW - c.width) / 2),
          top: px(bezel.t + c.offset),
          width: px(c.width),
          height: px(c.height),
          borderRadius: radius,
        };
  }

  // Home button sits in the chin (bottom bezel), which moves to the right when rotated.
  let homeStyle: Record<string, string> | null = null;
  if (frame.homeButton) {
    const chin = turned ? bezel.r : bezel.b;
    const d = Math.round(Math.min(56, chin * 0.6));
    homeStyle = turned
      ? {
          left: px(bezel.l + screenW + (bezel.r - d) / 2),
          top: px(bezel.t + (screenH - d) / 2),
          width: px(d),
          height: px(d),
        }
      : {
          left: px(bezel.l + (screenW - d) / 2),
          top: px(bezel.t + screenH + (bezel.b - d) / 2),
          width: px(d),
          height: px(d),
        };
  }

  return (
    <div
      class="device"
      data-preset={device.frame}
      data-rotated={turned ? 'true' : undefined}
      style={{
        width: px(layout.width),
        height: px(layout.height),
        '--frame-color': frame.color,
      }}
    >
      <div
        class="lid"
        style={{
          width: px(layout.lidW),
          height: px(layout.lidH),
          padding: `${px(bezel.t)} ${px(bezel.r)} ${px(bezel.b)} ${px(bezel.l)}`,
          borderRadius: px(frame.radius),
        }}
      >
        <div
          class="screen"
          style={{ width: px(screenW), height: px(screenH), borderRadius: px(frame.screenRadius) }}
        >
          {children}
        </div>
        {cutoutStyle && <div class="cutout" data-shape={frame.cutout?.shape} style={cutoutStyle} />}
        {homeStyle && <div class="home-button" style={homeStyle} />}
      </div>
      {frame.base && (
        <div class="base" style={{ width: px(layout.baseW), height: px(layout.baseH) }} />
      )}
      {frame.stand && (
        <div class="stand" style={{ height: px(layout.standH) }}>
          <div
            class="neck"
            style={{ width: px(frame.stand.neckWidth), height: px(frame.stand.neck) }}
          />
          <div
            class="foot"
            style={{ width: px(frame.stand.foot), height: px(frame.stand.footHeight) }}
          />
        </div>
      )}
    </div>
  );
}
