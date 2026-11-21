// A floating, draggable window that renders the page in an iframe at a chosen device size.
import { useEffect, useRef, useState } from 'preact/hooks';
import { canRotate, frameLayout, getDevice } from '@/lib/devices';
import { DeviceFrame } from './DeviceFrame';
import {
  BAR_WIDTH,
  bringToFront,
  clamp,
  close,
  update,
  type DeviceWindowState,
} from '@/lib/windowManager';

const TITLEBAR_HEIGHT = 36;
const MARGIN = 16;
/** Width of a minimized window (just its title bar). */
const MIN_OUTER_WIDTH = 300;
/** The title bar floats this far above the device, so it needs room above the window. */
const OVERLAY_GAP = 6;
const OVERLAY_SPACE = TITLEBAR_HEIGHT + OVERLAY_GAP;
/** Narrowest title bar, so its controls always fit. */
const MIN_BAR_WIDTH = 220;
const KEY_STEP = 15;

interface Props {
  win: DeviceWindowState;
  pageUrl: string;
}

export function DeviceWindow({ win, pageUrl }: Props) {
  const device = getDevice(win.deviceId);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offsetX: number; offsetY: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // True while the framed page has focus (you clicked inside the device), so the title bar stays.
  const [engaged, setEngaged] = useState(false);

  // Touch devices (phones, foldables, tablets) have no desktop scrollbar. Hide it inside our
  // own framed copy of the page; only possible while the frame is same-origin, so best effort.
  const hideScrollbar = canRotate(device);
  const syncScrollbar = () => {
    let doc: Document | null;
    try {
      doc = iframeRef.current?.contentDocument ?? null;
    } catch {
      return;
    }
    if (!doc?.documentElement) return;
    const id = 'device-lab-no-scrollbar';
    const existing = doc.getElementById(id);
    if (hideScrollbar && !existing) {
      const style = doc.createElement('style');
      style.id = id;
      style.textContent = 'html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';
      (doc.head ?? doc.documentElement).append(style);
    } else if (!hideScrollbar && existing) {
      existing.remove();
    }
  };
  useEffect(syncScrollbar, [hideScrollbar, win.minimized]);

  // CSS :focus-within does not reach into an iframe, so track it here. When focus moves into the
  // framed page, our window gets `blur` and the iframe becomes the active element (this also works
  // when the frame is cross-origin); when focus comes back, the window gets `focus`.
  useEffect(() => {
    const root = rootRef.current?.getRootNode() as ShadowRoot | undefined;
    const check = () =>
      setEngaged(!!iframeRef.current && root?.activeElement === iframeRef.current);
    window.addEventListener('blur', check);
    window.addEventListener('focus', check);
    root?.addEventListener('focusin', check);
    check();
    return () => {
      window.removeEventListener('blur', check);
      window.removeEventListener('focus', check);
      root?.removeEventListener('focusin', check);
      setEngaged(false);
    };
  }, [win.minimized]);

  // The iframe keeps its real CSS size (so media queries see the device width);
  // the whole framed device is scaled down with the `scale` property to fit the viewport.
  // Windows never extend under the icon bar on the right.
  const viewW = window.innerWidth - BAR_WIDTH;
  const layout = frameLayout(device, win.rotated);
  const innerW = layout.screenW;
  const innerH = layout.screenH;
  const scale = Math.max(
    0.1,
    Math.min(
      1,
      (viewW - 2 * MARGIN) / layout.width,
      (window.innerHeight - OVERLAY_SPACE - MARGIN) / layout.height,
    ),
  );
  const deviceW = layout.width * scale;
  const deviceH = layout.height * scale;
  const outerW = Math.max(deviceW, win.minimized ? MIN_OUTER_WIDTH : MIN_BAR_WIDTH);
  // Minimized: only the title bar is left, in the flow. Otherwise the bar floats above the device.
  const outerH = win.minimized ? TITLEBAR_HEIGHT : deviceH;
  const minY = win.minimized ? 0 : OVERLAY_SPACE;

  const x = clamp(win.x, 0, viewW - outerW);
  const y = clamp(win.y, minY, window.innerHeight - outerH);

  const clampPos = (px: number, py: number) => ({
    x: clamp(px, 0, viewW - outerW),
    y: clamp(py, minY, window.innerHeight - outerH),
  });

  const announce = (text: string) => {
    setAnnouncement(text);
    setTimeout(() => setAnnouncement(''), 1000);
  };

  const onHandlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement;
    drag.current = { offsetX: e.clientX - x, offsetY: e.clientY - y, x, y };
    handle.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: PointerEvent) => {
    const handle = e.currentTarget as HTMLElement;
    const state = drag.current;
    if (!state || !handle.hasPointerCapture(e.pointerId)) return;
    setDragging(true);
    const next = clampPos(e.clientX - state.offsetX, e.clientY - state.offsetY);
    state.x = next.x;
    state.y = next.y;
    // Translate during the drag to avoid per-frame layout; commit on release.
    if (rootRef.current) rootRef.current.style.translate = `${next.x - x}px ${next.y - y}px`;
  };

  const onHandleLostCapture = () => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (!state) return;
    if (rootRef.current) rootRef.current.style.translate = '0px';
    if (state.x !== x || state.y !== y) update(win.id, { x: state.x, y: state.y });
  };

  const onHandleKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number, string]> = {
      ArrowLeft: [-KEY_STEP, 0, 'moved left'],
      ArrowRight: [KEY_STEP, 0, 'moved right'],
      ArrowUp: [0, -KEY_STEP, 'moved up'],
      ArrowDown: [0, KEY_STEP, 'moved down'],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const next = clampPos(x + move[0], y + move[1]);
    update(win.id, next);
    announce(`${device.name} window ${move[2]}`);
  };

  return (
    <div
      ref={rootRef}
      class="window"
      data-minimized={win.minimized ? 'true' : undefined}
      data-engaged={engaged ? 'true' : undefined}
      style={{ left: `${x}px`, top: `${y}px`, width: `${outerW}px`, zIndex: win.z }}
      onFocusIn={() => bringToFront(win.id)}
      onPointerDown={() => bringToFront(win.id)}
    >
      <div class="titlebar">
        <button
          type="button"
          class={`handle${dragging ? ' dragging' : ''}`}
          aria-label={`Move ${device.name} window, ${innerW}×${innerH}. Use arrow keys to move.`}
          title={`${device.name} · ${innerW}×${innerH} @${device.dpr} · ${Math.round(scale * 100)}% — drag or use arrow keys to move`}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onLostPointerCapture={onHandleLostCapture}
          onKeyDown={onHandleKeyDown}
        >
          <span class="grip" aria-hidden="true">
            ⋮⋮
          </span>
          <span class="size">{device.name}</span>
        </button>
        <button
          type="button"
          class="btn"
          aria-label={win.minimized ? 'Restore' : 'Minimize'}
          title={win.minimized ? 'Restore' : 'Minimize'}
          onClick={() => update(win.id, { minimized: !win.minimized })}
        >
          {win.minimized ? '▢' : '–'}
        </button>
        <button
          type="button"
          class="btn"
          aria-label="Close"
          title="Close"
          onClick={() => close(win.id)}
        >
          ×
        </button>
      </div>
      {!win.minimized && (
        <div class="device-box" style={{ width: `${deviceW}px`, height: `${deviceH}px` }}>
          <div
            class="device-scale"
            style={{ width: `${layout.width}px`, height: `${layout.height}px`, scale }}
          >
            <DeviceFrame device={device} rotated={win.rotated}>
              {/* Not rendered while minimized, so the page and its memory are released. */}
              <iframe
                ref={iframeRef}
                class="frame"
                src={pageUrl}
                title={`${device.name} preview`}
                onLoad={syncScrollbar}
              />
            </DeviceFrame>
          </div>
        </div>
      )}
      <div class="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
