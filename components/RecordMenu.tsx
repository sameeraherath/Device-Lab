// Record button + popover in a device's title bar. Choose what to record and how, then press
// "Start recording". While a recording or countdown runs, the button stops or cancels it instead.
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { canAutoScroll, SCROLL_SPEEDS } from '@/lib/autoScroll';
import { requestMic } from '@/lib/messages';
import { cancelCountdown, startRecording, stopRecording, useRecordState } from '@/lib/record';
import {
  DEFAULT_RECORD_PREFS,
  MAX_COUNTDOWN,
  getMicGranted,
  getRecordPrefs,
  setRecordPrefs,
  type RecordMode,
  type RecordPrefs,
  type RecordQuality,
  type ScrollSpeed,
} from '@/lib/storage';

const hasInvokers = 'commandForElement' in HTMLButtonElement.prototype;
const hasAnchorPositioning = CSS.supports('position-area: block-end');
const attrs = (a: Record<string, string>) => a as Record<string, string>;

const QUALITIES: { id: RecordQuality; badge: string; name: string; hint: string }[] = [
  { id: 'good', badge: 'HD', name: 'Good', hint: '720p, small files' },
  { id: 'better', badge: 'FHD', name: 'Better', hint: '1080p, sharper' },
  { id: 'best', badge: '2K', name: 'Best', hint: '1440p, largest files' },
];

const SPEEDS: { id: ScrollSpeed; name: string }[] = [
  { id: 'slow', name: 'Slow' },
  { id: 'medium', name: 'Medium' },
  { id: 'fast', name: 'Fast' },
];

const SOON = 'Coming in the next update';

/** Small drawings of what goes in the video. */
function ModeDrawing({ mode }: { mode: RecordMode }) {
  return (
    <svg viewBox="0 0 72 48" width="72" height="48" aria-hidden="true">
      <rect
        x="26"
        y="3"
        width="20"
        height="42"
        rx="5"
        fill="#1b1c1f"
        stroke="#c4c7c5"
        stroke-width="1.6"
      />
      <rect x="28.5" y="6" width="15" height="36" rx="2.5" fill="#e8eaed" />
      <rect x="32" y="7.5" width="8" height="2.4" rx="1.2" fill="#1b1c1f" />
      {mode === 'camera' && (
        <>
          <circle cx="17" cy="35" r="9" fill="#4a4f57" stroke="#fff" stroke-width="1.4" />
          <circle cx="17" cy="32" r="3" fill="#fff" />
          <path d="M11 41c1-4 11-4 12 0" fill="#fff" />
        </>
      )}
    </svg>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (value: boolean) => void;
  children?: preact.ComponentChildren;
}

function Switch({ label, checked, disabled, title, onChange, children }: SwitchProps) {
  return (
    <label
      class="rec-row"
      title={disabled ? title : undefined}
      data-disabled={disabled || undefined}
    >
      <span class="rec-icon" aria-hidden="true">
        {children}
      </span>
      <span class="rec-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        class="rec-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
      />
    </label>
  );
}

const Svg = ({ children }: { children: preact.ComponentChildren }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {children}
  </svg>
);

interface Props {
  windowId: number;
  deviceName: string;
  minimized: boolean;
  /** The window's root element, to measure and mark while recording. */
  getRoot: () => HTMLElement | null;
}

export function RecordMenu({ windowId, deviceName, minimized, getRoot }: Props) {
  const uid = useId();
  const menuId = `record-menu-${uid}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<RecordPrefs>(DEFAULT_RECORD_PREFS);
  const record = useRecordState();
  // Short message under the microphone switch: waiting for permission, or why it is off.
  const [micNote, setMicNote] = useState('');
  // False when the framed page is from another site and cannot be scrolled by script.
  const [canScroll, setCanScroll] = useState(true);
  const mine = record.windowId === windowId;
  const recording = mine && record.phase === 'recording';
  const counting = mine && record.phase === 'countdown';
  const busy = record.phase !== 'idle' && !recording && !counting;
  const otherActive = record.phase !== 'idle' && !mine;

  useEffect(() => {
    void getRecordPrefs().then(setPrefs);
  }, []);

  const update = (patch: Partial<RecordPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void setRecordPrefs(next);
  };

  const toggleMic = async (on: boolean) => {
    setMicNote('');
    if (!on) {
      update({ mic: false });
      return;
    }
    if (!(await getMicGranted())) {
      setMicNote('Waiting for permission…');
      const result = await requestMic();
      if (!result.ok) {
        update({ mic: false });
        setMicNote(result.error);
        return;
      }
      setMicNote('');
    }
    update({ mic: true });
  };

  const isOpen = () => !!menuRef.current?.matches(':popover-open');

  // Without CSS anchor positioning, place the menu under the button (kept inside the viewport).
  useEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    const onToggle = (e: Event) => {
      const opening = (e as ToggleEvent).newState === 'open';
      trigger.setAttribute('aria-expanded', String(opening));
      if (opening) setCanScroll(canAutoScroll(getRoot()?.querySelector('iframe.frame')));
      if (!opening || hasAnchorPositioning) return;
      const t = trigger.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const fitsBelow = t.bottom + 4 + m.height <= innerHeight;
      menu.style.top = `${fitsBelow ? t.bottom + 4 : Math.max(4, t.top - 4 - m.height)}px`;
      menu.style.left = `${Math.min(Math.max(4, t.right - m.width), innerWidth - m.width - 4)}px`;
    };
    menu.addEventListener('toggle', onToggle);
    return () => menu.removeEventListener('toggle', onToggle);
  }, []);

  // Close the menu if a recording or countdown begins some other way.
  useEffect(() => {
    if ((recording || counting) && isOpen()) menuRef.current?.hidePopover();
  }, [recording, counting]);

  const onTriggerClick = (e: MouseEvent) => {
    if (recording) {
      e.preventDefault();
      void stopRecording();
      return;
    }
    if (counting) {
      e.preventDefault();
      cancelCountdown();
      return;
    }
    if (hasInvokers) return; // the browser toggles the popover itself
    e.preventDefault();
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    if (isOpen()) menu.hidePopover();
    else menu.showPopover({ source: trigger } as ShowPopoverOptions);
  };

  const start = () => {
    const root = getRoot();
    menuRef.current?.hidePopover();
    if (root) void startRecording(root, deviceName, prefs);
  };

  const label = recording
    ? 'Stop recording'
    : counting
      ? 'Cancel recording'
      : `Record ${deviceName}`;
  const quality = QUALITIES.find((q) => q.id === prefs.quality) ?? QUALITIES[0]!;
  const startBlocked = minimized || busy || otherActive;
  const startReason = minimized
    ? 'Restore the window first'
    : otherActive
      ? 'Another device is recording'
      : busy
        ? 'Please wait…'
        : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="record-btn"
        data-recording={recording || counting ? 'true' : undefined}
        aria-label={label}
        title={label}
        aria-haspopup={recording || counting ? undefined : 'dialog'}
        aria-expanded="false"
        disabled={busy || otherActive}
        {...(recording || counting ? {} : attrs({ commandfor: menuId, command: 'toggle-popover' }))}
        onPointerDown={(e) => {
          // Keep the click from also light-dismissing a menu that is already open.
          if (isOpen()) e.preventDefault();
        }}
        onClick={onTriggerClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {recording || counting ? (
            <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
          ) : (
            <>
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
              <circle cx="12" cy="12" r="5" fill="currentColor" />
            </>
          )}
        </svg>
        <span>
          {recording ? <RecordTimer startedAt={record.startedAt} /> : counting ? 'Cancel' : 'Rec'}
        </span>
      </button>
      {/* Right after its trigger, so browsers add no implicit aria-details. */}
      <div
        ref={menuRef}
        id={menuId}
        class="rec-menu"
        role="dialog"
        aria-label="Recording options"
        {...attrs({ popover: 'auto' })}
      >
        <div class="rec-tiles" role="radiogroup" aria-label="What to record">
          <button
            type="button"
            class="rec-tile"
            role="radio"
            aria-checked={prefs.mode === 'device'}
            title="Device only"
            onClick={() => update({ mode: 'device' })}
          >
            <ModeDrawing mode="device" />
            <span class="visually-hidden">Device only</span>
          </button>
          <button
            type="button"
            class="rec-tile"
            role="radio"
            aria-checked={false}
            aria-disabled="true"
            title={`Device with camera. ${SOON}`}
          >
            <ModeDrawing mode="camera" />
            <span class="visually-hidden">Device with camera ({SOON})</span>
          </button>
        </div>

        <Switch label="Microphone" checked={prefs.mic} onChange={(on) => void toggleMic(on)}>
          <Svg>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </Svg>
        </Switch>
        {micNote && (
          <p class="rec-note" role="status">
            {micNote}
          </p>
        )}
        <Switch
          label="Page audio"
          checked={prefs.pageAudio}
          onChange={(pageAudio) => update({ pageAudio })}
        >
          <Svg>
            <path d="M4 9v6h4l5 4V5L8 9z" />
            <path d="M16.5 9a4 4 0 0 1 0 6" />
          </Svg>
        </Switch>
        {prefs.mic && prefs.pageAudio && (
          <p class="rec-note">Use headphones, so your microphone does not pick up the page.</p>
        )}
        <Switch
          label="Auto-scroll"
          checked={prefs.autoScroll && canScroll}
          disabled={!canScroll}
          title="This page comes from another site, so it can't be scrolled automatically"
          onChange={(autoScroll) => update({ autoScroll })}
        >
          <Svg>
            <path d="M12 4v16M7 15l5 5 5-5M7 9l5-5 5 5" />
          </Svg>
        </Switch>
        {prefs.autoScroll && canScroll && (
          <div class="rec-speed" role="radiogroup" aria-label="Scroll speed">
            {SPEEDS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={prefs.scrollSpeed === s.id}
                title={`${SCROLL_SPEEDS[s.id]} px per second`}
                onClick={() => update({ scrollSpeed: s.id })}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <label class="rec-row">
          <span class="rec-icon" aria-hidden="true">
            <Svg>
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M8 12h3M13 12h3" />
            </Svg>
          </span>
          <span class="rec-label">Video quality</span>
          <span class="rec-select">
            <span class="rec-badge" aria-hidden="true">
              {quality.badge}
            </span>
            <select
              aria-label="Video quality"
              value={prefs.quality}
              onChange={(e) =>
                update({ quality: (e.currentTarget as HTMLSelectElement).value as RecordQuality })
              }
            >
              {QUALITIES.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} · {q.hint}
                </option>
              ))}
            </select>
          </span>
        </label>

        <button
          type="button"
          class="rec-go"
          aria-disabled={startBlocked}
          title={startReason}
          onClick={() => {
            if (!startBlocked) start();
          }}
        >
          Start recording
        </button>
        {startReason && <p class="rec-note">{startReason}.</p>}

        <details
          class="rec-more"
          open={prefs.moreOpen}
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            if (open !== prefs.moreOpen) update({ moreOpen: open });
          }}
        >
          <summary>More settings</summary>
          <label class="rec-row">
            <span class="rec-icon" aria-hidden="true">
              <Svg>
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l3 2M9 2h6" />
              </Svg>
            </span>
            <span class="rec-label">Countdown (seconds)</span>
            <input
              type="number"
              class="rec-number"
              min="0"
              max={MAX_COUNTDOWN}
              step="1"
              inputMode="numeric"
              value={prefs.countdown}
              onChange={(e) => {
                const n = Math.round(Number((e.currentTarget as HTMLInputElement).value));
                update({
                  countdown: Number.isFinite(n) ? Math.min(MAX_COUNTDOWN, Math.max(0, n)) : 3,
                });
              }}
            />
          </label>
          <div class="rec-row">
            <span class="rec-icon" aria-hidden="true">
              <Svg>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18M9 5v14" />
              </Svg>
            </span>
            <span class="rec-label" id={`${menuId}-fps`}>
              Frame rate
            </span>
            <div class="rec-seg" role="radiogroup" aria-labelledby={`${menuId}-fps`}>
              {([30, 60] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={prefs.fps === f}
                  onClick={() => update({ fps: f })}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <Switch
            label="Transparent background"
            checked={false}
            disabled
            title={SOON}
            onChange={() => {}}
          >
            <Svg>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 12h18M12 3v18" />
            </Svg>
          </Switch>
        </details>
      </div>
      <span class="visually-hidden" role="status">
        {counting ? `Recording starts in ${record.countdown}` : recording ? 'Recording' : ''}
      </span>
    </>
  );
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
