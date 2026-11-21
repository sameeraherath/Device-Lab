// Draws a device with CSS only: metal rim, bezel, cutout, side buttons, status bar, bottom bar,
// home button, laptop base and monitor stand.
import type { ComponentChildren } from 'preact';
import { canRotate, frameLayout, getFrame, screenCornerRadii, type Device } from '@/lib/devices';
import { BottomBar, StatusBar } from './DeviceChrome';
import type { DragProps } from './dragProps';

const px = (n: number) => `${n}px`;

interface Props {
  device: Device;
  rotated: boolean;
  /** Pointer handlers that make the device body (frame, buttons, base, stand) draggable. */
  dragProps?: DragProps;
  children: ComponentChildren;
}

export function DeviceFrame({ device, rotated, dragProps, children }: Props) {
  const frame = getFrame(device);
  const layout = frameLayout(device, rotated);
  const { screenW, screenH, bezel, statusH } = layout;

  // "Show frame" off: just the page at the device size.
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
  const rim = frame.rim ? (frame.rimWidth ?? 2) : 0;
  // Absolutely positioned parts of the lid are measured from inside the rim.
  const inL = bezel.l - rim;
  const inT = bezel.t - rim;

  // Cutout: centred on the top edge in portrait; on the left edge, vertically centred, when rotated.
  let cutoutStyle: Record<string, string> | null = null;
  if (frame.cutout) {
    const c = frame.cutout;
    const r = Math.min(c.width, c.height) / 2;
    const radius =
      c.shape === 'notch' ? (turned ? `0 ${px(r)} ${px(r)} 0` : `0 0 ${px(r)} ${px(r)}`) : '999px';
    cutoutStyle = turned
      ? {
          left: px(inL + c.offset),
          top: px(inT + (screenH - c.width) / 2),
          width: px(c.height),
          height: px(c.width),
          borderRadius: radius,
        }
      : {
          left: px(inL + (screenW - c.width) / 2),
          top: px(inT + c.offset),
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
          left: px(inL + screenW + (bezel.r - d) / 2),
          top: px(inT + (screenH - d) / 2),
          width: px(d),
          height: px(d),
        }
      : {
          left: px(inL + (screenW - d) / 2),
          top: px(inT + screenH + (bezel.b - d) / 2),
          width: px(d),
          height: px(d),
        };
  }

  const lidStyle: Record<string, string> = {
    width: px(layout.lidW),
    height: px(layout.lidH),
    padding: `${px(bezel.t - rim)} ${px(bezel.r - rim)} ${px(bezel.b - rim)} ${px(bezel.l - rim)}`,
    borderRadius: px(frame.radius),
    borderWidth: px(rim),
  };
  if (frame.rim) {
    lidStyle['--rim-light'] = frame.rim[0];
    lidStyle['--rim-dark'] = frame.rim[1];
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
        '--rim-light': frame.rim?.[0] ?? frame.color,
        '--rim-dark': frame.rim?.[1] ?? frame.color,
        '--rim-highlight': frame.rimHighlight ?? frame.rim?.[0] ?? frame.color,
      }}
    >
      <div class="lid-wrap" style={{ padding: px(layout.pad) }}>
        {layout.buttons.map((b, i) => (
          <div
            key={i}
            class="hw-button grab"
            style={{ left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) }}
            {...dragProps}
          />
        ))}
        <div class={`lid grab${frame.rim ? ' has-rim' : ''}`} style={lidStyle} {...dragProps}>
          <div
            class="screen"
            style={{
              width: px(screenW),
              height: px(screenH),
              borderRadius: screenCornerRadii(frame, bezel),
            }}
          >
            <StatusBar kind={frame.statusBar ?? 'none'} height={statusH} dragProps={dragProps} />
            <div class="viewport" style={{ height: px(screenH - statusH) }}>
              {children}
              <BottomBar kind={frame.bottomBar ?? 'none'} rotated={turned} />
            </div>
          </div>
          {cutoutStyle && (
            <div class="cutout" data-shape={frame.cutout?.shape} style={cutoutStyle} />
          )}
          {homeStyle && <div class="home-button" style={homeStyle} />}
        </div>
      </div>
      {frame.base && (
        <div
          class="base grab"
          style={{ width: px(layout.baseW), height: px(layout.baseH) }}
          {...dragProps}
        />
      )}
      {frame.stand && (
        <div class="stand" style={{ height: px(layout.standH) }}>
          <div
            class="neck grab"
            style={{ width: px(frame.stand.neckWidth), height: px(frame.stand.neck) }}
            {...dragProps}
          />
          <div
            class="foot grab"
            style={{ width: px(frame.stand.foot), height: px(frame.stand.footHeight) }}
            {...dragProps}
          />
        </div>
      )}
    </div>
  );
}
