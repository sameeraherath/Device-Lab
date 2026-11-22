// Camera button + popover: pick what to capture (device, screen, full page, device on a background),
// press "Take screenshot", then export the result from a dialog.
import { useEffect, useRef, useState } from 'preact/hooks';
import { getDevice } from '@/lib/devices';
import { CaptureError, captureWindow, type CaptureResult } from '@/lib/capture';
import {
  DEFAULT_SHOT_PREFS,
  getScreenshotPrefs,
  setScreenshotPrefs,
  type ScreenshotPrefs,
  type ShotMode,
} from '@/lib/storage';
import type { DeviceWindowState } from '@/lib/windowManager';
import { Icon } from './Icons';
import { ScreenshotDialog, type ShotOutcome } from './ScreenshotDialog';

const MENU_ID = 'screenshot-menu';
// Native invoker commands and popover are not in the JSX types.
const TRIGGER_ATTRS = { commandfor: MENU_ID, command: 'toggle-popover' } as object;
const POPOVER_ATTRS = { popover: 'auto' } as object;

interface ModeInfo {
  id: ShotMode;
  name: string;
  hint: string;
  beta?: boolean;
}

const MODES: ModeInfo[] = [
  {
    id: 'device',
    name: 'Device',
    hint: 'The device with its frame, cropped to its edges, on a transparent background.',
  },
  {
    id: 'screen',
    name: 'Screen',
    hint: 'Only the screen, like a screenshot taken on the device: its status bar and browser bars are included, the frame is not.',
  },
  {
    id: 'page',
    name: 'Full page',
    hint: 'The whole scrolling page at the device’s width, without the frame or bars.',
    beta: true,
  },
  {
    id: 'background',
    name: 'Device on background',
    hint: 'The framed device centred on a colour you choose, with space around it.',
  },
];

/** Small drawings of what each mode captures. */
function ModeDrawing({ id }: { id: ShotMode }) {
  return (
    <svg viewBox="0 0 40 48" width="40" height="48" aria-hidden="true">
      {id === 'device' && (
        <>
          <rect
            x="9"
            y="3"
            width="22"
            height="42"
            rx="5"
            fill="#1b1c1f"
            stroke="#c4c7c5"
            stroke-width="1.6"
          />
          <rect x="11.5" y="6" width="17" height="36" rx="2.5" fill="#e8eaed" />
          <rect x="16" y="7.5" width="8" height="2.4" rx="1.2" fill="#1b1c1f" />
        </>
      )}
      {id === 'screen' && <rect x="9" y="3" width="22" height="42" rx="2" fill="#e8eaed" />}
      {id === 'page' && (
        <>
          <rect x="9" y="3" width="22" height="42" rx="2" fill="#e8eaed" />
          <path
            d="M20 15v17m-5-5l5 5 5-5"
            fill="none"
            stroke="#202124"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </>
      )}
      {id === 'background' && (
        <>
          <rect x="1" y="1" width="38" height="46" rx="4" fill="#b9bbbe" />
          <rect
            x="11"
            y="7"
            width="18"
            height="34"
            rx="4.5"
            fill="#1b1c1f"
            stroke="#fff"
            stroke-width="1.4"
          />
          <rect x="13" y="9.5" width="14" height="29" rx="2.5" fill="#fff" />
        </>
      )}
    </svg>
  );
}

interface Props {
  /** The focused device window, the one the other sidebar tools control. */
  target: DeviceWindowState | undefined;
}

export function ScreenshotMenu({ target }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<ScreenshotPrefs>(DEFAULT_SHOT_PREFS);
  const [hover, setHover] = useState<ShotMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ShotOutcome | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void getScreenshotPrefs().then(setPrefs);
  }, []);

  const update = (patch: Partial<ScreenshotPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void setScreenshotPrefs(next);
  };

  const disabled = !target || target.minimized || busy;
  const reason = !target
    ? 'Open a device first'
    : target.minimized
      ? 'Restore the window first'
      : busy
        ? 'Capturing…'
        : '';

  const take = async () => {
    const root = triggerRef.current?.getRootNode() as ShadowRoot | undefined;
    if (!target || disabled || !root) return;
    const device = getDevice(target.deviceId);
    // The popover stays open so its button can show the progress, unless it covers the device:
    // then it would be in the picture, so close it and let the camera button show the progress.
    const menu = menuRef.current;
    const win = root.querySelector(`.window[data-window-id="${target.id}"]`);
    if (menu && win) {
      const m = menu.getBoundingClientRect();
      const w = win.getBoundingClientRect();
      if (m.left < w.right && m.right > w.left && m.top < w.bottom && m.bottom > w.top) {
        menu.hidePopover();
      }
    }
    setBusy(true);
    setProgress(null);
    setStatus('Taking screenshot');
    try {
      // "Device on background" is the framed device; the background is applied in the export step.
      const result: CaptureResult = await captureWindow(
        root,
        target.id,
        prefs.mode === 'background' ? 'device' : prefs.mode,
        (done, total) => setProgress(total > 1 ? { done, total } : null),
      );
      menu?.hidePopover();
      setOutcome({ result, deviceId: device.id, mode: prefs.mode });
      setStatus('Screenshot ready');
    } catch (e) {
      const message =
        e instanceof CaptureError ? e.message : 'The screenshot could not be taken. Try again.';
      menu?.hidePopover();
      setOutcome({ error: message, deviceId: device.id, mode: prefs.mode });
      setStatus('Screenshot failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const shown = MODES.find((m) => m.id === (hover ?? prefs.mode)) ?? MODES[0]!;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="tool"
        data-tool
        aria-label="Screenshot"
        aria-haspopup="true"
        aria-busy={busy}
        data-busy={busy ? '' : undefined}
        title={busy ? 'Taking screenshot…' : 'Screenshot'}
        {...TRIGGER_ATTRS}
      >
        <Icon name="camera" />
        {busy && <span class="spinner" aria-hidden="true" />}
      </button>
      {/* Placed right after its trigger so no implicit aria-details is added. */}
      <div
        ref={menuRef}
        id={MENU_ID}
        class="shot-menu"
        aria-label="Screenshot options"
        onToggle={() => setHover(null)}
        {...POPOVER_ATTRS}
      >
        <div class="shot-grid" role="radiogroup" aria-label="What to capture">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              class="shot-tile"
              role="radio"
              aria-checked={prefs.mode === m.id}
              aria-describedby="shot-hint"
              onClick={() => update({ mode: m.id })}
              onPointerEnter={() => setHover(m.id)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(m.id)}
              onBlur={() => setHover(null)}
            >
              <ModeDrawing id={m.id} />
              {m.beta && (
                <span class="shot-beta" aria-hidden="true">
                  Beta
                </span>
              )}
              <span class="visually-hidden">{m.name}</span>
            </button>
          ))}
        </div>
        <p id="shot-hint" class="shot-hint" aria-live="polite">
          <strong>{shown.name}</strong>
          {shown.beta ? <span class="shot-beta inline">Beta</span> : null}
          <span>{shown.hint}</span>
        </p>
        <button
          type="button"
          class="shot-go"
          aria-disabled={disabled}
          aria-busy={busy}
          title={reason}
          onClick={() => void take()}
        >
          {busy && <span class="spinner" aria-hidden="true" />}
          {busy
            ? progress
              ? `Capturing ${progress.done} of ${progress.total}…`
              : 'Capturing…'
            : 'Take screenshot'}
        </button>
        {reason && !busy && <p class="shot-note">{reason}.</p>}
      </div>
      <span class="visually-hidden" role="status">
        {status}
      </span>
      <ScreenshotDialog
        outcome={outcome}
        prefs={prefs}
        onPrefs={update}
        onClose={() => setOutcome(null)}
      />
    </>
  );
}
