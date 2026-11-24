// A floating, draggable window that renders the page in an iframe at a chosen device size.
import { useEffect, useRef, useState } from 'preact/hooks';
import { canRotate, getDevice, getFrame, themeSource } from '@/lib/devices';
import { pageCanvas, pageTheme, type StatusTheme } from '@/lib/pageInfo';
import { DeviceFrame } from './DeviceFrame';
import { FinishPicker } from './FinishPicker';
import {
  dismissRecordError,
  startRecording,
  stopIfRecording,
  stopRecording,
  useRecordState,
} from '@/lib/record';
import {
  BAR_WIDTH,
  MIN_BAR_WIDTH,
  OVERLAY_SPACE,
  TITLEBAR_HEIGHT,
  bringToFront,
  clamp,
  close,
  update,
  windowSize,
  type DeviceWindowState,
} from '@/lib/windowManager';

/** Width of a minimized window (just its title bar). */
const MIN_OUTER_WIDTH = 300;
const KEY_STEP = 15;

interface Props {
  win: DeviceWindowState;
  pageUrl: string;
}

/** Elapsed recording time, m:ss, ticking once a second. */
function RecordTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return (
    <>
      Stop {Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}
    </>
  );
}

export function DeviceWindow({ win, pageUrl }: Props) {
  const device = getDevice(win.deviceId);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offsetX: number; offsetY: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const record = useRecordState();
  const recordingHere = record.windowId === win.id && record.phase !== 'idle';
  // Closing the window while it records keeps the video.
  useEffect(() => () => stopIfRecording(win.id), [win.id]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Colours for the device's bars come from the framed page (its own background or theme-color).
  const source = themeSource(getFrame(device));
  const [theme, setTheme] = useState<StatusTheme>(() => pageTheme(document, source));
  const [canvas, setCanvas] = useState(() => pageCanvas(document));
  const syncTheme = () => {
    let doc: Document = document;
    try {
      doc = iframeRef.current?.contentDocument ?? document;
    } catch {
      // Cross-origin frame: the top page is the same site, so its colours are the next best.
    }
    const next = pageTheme(doc, source);
    setCanvas(pageCanvas(doc));
    setTheme((cur) =>
      cur.background === next.background && cur.foreground === next.foreground ? cur : next,
    );
  };
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
  useEffect(syncTheme, [source, win.minimized]);

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
  const { layout, scale, deviceW, deviceH } = windowSize(device, win.rotated);
  const innerW = layout.screenW;
  const innerH = layout.screenH;
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
    if (e.button !== 0 || recordingHere) return; // the recording crop is fixed on the screen
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

  // One drag engine for every surface: the title bar handle, the frame, the side buttons, the
  // status bar, the laptop base and the monitor stand. Pointer capture keeps the drag going.
  const dragProps = {
    onPointerDown: onHandlePointerDown,
    onPointerMove: onHandlePointerMove,
    onLostPointerCapture: () => onHandleLostCapture(),
    // Without these, a press on the frame can start a native text/image drag in the page behind,
    // and the browser then cancels the pointer in the middle of our drag.
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    onDragStart: (e: DragEvent) => e.preventDefault(),
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
      data-window-id={win.id}
      data-minimized={win.minimized ? 'true' : undefined}
      data-engaged={engaged ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
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
          {...dragProps}
          onKeyDown={onHandleKeyDown}
        >
          <span class="grip" aria-hidden="true">
            ⋮⋮
          </span>
          <span class="size">
            {device.name} · {innerW}×{innerH} @{device.dpr} · {Math.round(scale * 100)}%
          </span>
        </button>
        {getFrame(device) && <FinishPicker device={device} />}
        <button
          type="button"
          class="record-btn"
          data-recording={recordingHere ? 'true' : undefined}
          aria-label={recordingHere ? 'Stop recording' : `Record ${device.name}`}
          title={recordingHere ? 'Stop recording' : 'Record this device'}
          disabled={
            record.phase === 'starting' ||
            record.phase === 'stopping' ||
            (record.phase !== 'idle' && !recordingHere)
          }
          onClick={() => {
            if (recordingHere) void stopRecording();
            else if (rootRef.current) void startRecording(rootRef.current, device.name);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {recordingHere ? (
              <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
            ) : (
              <>
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
                <circle cx="12" cy="12" r="5" fill="currentColor" />
              </>
            )}
          </svg>
          <span>{recordingHere ? <RecordTimer startedAt={record.startedAt} /> : 'Rec'}</span>
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
            style={{
              width: `${layout.width}px`,
              height: `${layout.height}px`,
              scale,
            }}
          >
            <DeviceFrame
              device={device}
              rotated={win.rotated}
              theme={theme}
              canvas={canvas}
              dragProps={dragProps}
            >
              {/* Not rendered while minimized, so the page and its memory are released. */}
              <iframe
                ref={iframeRef}
                class="frame"
                src={pageUrl}
                title={`${device.name} preview`}
                onLoad={() => {
                  syncScrollbar();
                  syncTheme();
                  // Late-applied styles (fonts, JS-set backgrounds) settle shortly after load.
                  setTimeout(syncTheme, 800);
                }}
              />
            </DeviceFrame>
          </div>
        </div>
      )}
      <div class="visually-hidden" aria-live="polite">
        {announcement}
      </div>
      {record.error && record.windowId === win.id && (
        <div class="record-error" role="alert">
          <span>{record.error}</span>
          <button type="button" aria-label="Dismiss" onClick={dismissRecordError}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
