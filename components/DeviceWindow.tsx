// A floating, draggable window that renders the page in an iframe at a chosen device size.
import { useRef, useState } from 'preact/hooks';
import { getDevice } from '@/lib/devices';
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
const MIN_OUTER_WIDTH = 300;
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

  // The iframe keeps its real CSS size (so media queries see the device width);
  // the whole screen is scaled down with the `scale` property to fit the viewport.
  // Windows never extend under the icon bar on the right.
  const viewW = window.innerWidth - BAR_WIDTH;
  const innerW = win.rotated ? device.height : device.width;
  const innerH = win.rotated ? device.width : device.height;
  const scale = Math.max(
    0.1,
    Math.min(
      1,
      (viewW - 2 * MARGIN) / innerW,
      (window.innerHeight - TITLEBAR_HEIGHT - 2 * MARGIN) / innerH,
    ),
  );
  const screenW = innerW * scale;
  const screenH = innerH * scale;
  const outerW = Math.max(screenW, MIN_OUTER_WIDTH);
  const outerH = TITLEBAR_HEIGHT + (win.minimized ? 0 : screenH);

  const x = clamp(win.x, 0, viewW - outerW);
  const y = clamp(win.y, 0, window.innerHeight - outerH);

  const clampPos = (px: number, py: number) => ({
    x: clamp(px, 0, viewW - outerW),
    y: clamp(py, 0, window.innerHeight - outerH),
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
      style={{ left: `${x}px`, top: `${y}px`, width: `${outerW}px`, zIndex: win.z }}
      onFocusIn={() => bringToFront(win.id)}
      onPointerDown={() => bringToFront(win.id)}
    >
      <div class="titlebar">
        <button
          type="button"
          class={`handle${dragging ? ' dragging' : ''}`}
          aria-label={`Move ${device.name} window. Use arrow keys to move.`}
          title="Drag or use arrow keys to move"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onLostPointerCapture={onHandleLostCapture}
          onKeyDown={onHandleKeyDown}
        >
          <span class="grip" aria-hidden="true">
            ⋮⋮
          </span>
          <span class="size">
            {device.name} · {innerW}×{innerH} · {Math.round(scale * 100)}%
          </span>
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
        <div class="screen-box" style={{ width: `${screenW}px`, height: `${screenH}px` }}>
          <div class="screen" style={{ width: `${innerW}px`, height: `${innerH}px`, scale: scale }}>
            {/* Not rendered while minimized, so the page and its memory are released. */}
            <iframe class="frame" src={pageUrl} title={`${device.name} preview`} />
          </div>
        </div>
      )}
      <div class="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
