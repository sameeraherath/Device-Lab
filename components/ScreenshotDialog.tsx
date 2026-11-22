// Export dialog: preview the screenshot, choose format, quality, background and padding,
// then download it or copy it to the clipboard.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getDevice } from '@/lib/devices';
import type { CaptureResult } from '@/lib/capture';
import type {
  ScreenshotPrefs,
  ShotBackground,
  ShotFormat,
  ShotMode,
  ShotPadding,
} from '@/lib/storage';

export interface ShotOutcome {
  result?: CaptureResult;
  error?: string;
  deviceId: string;
  mode: ShotMode;
}

interface Props {
  outcome: ShotOutcome | null;
  prefs: ScreenshotPrefs;
  onPrefs: (patch: Partial<ScreenshotPrefs>) => void;
  onClose: () => void;
}

const FORMATS: { id: ShotFormat; label: string; mime: string; ext: string }[] = [
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp' },
];

const BACKGROUNDS: { id: ShotBackground; label: string }[] = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
  { id: 'custom', label: 'Colour' },
];

const PADDINGS: { id: ShotPadding; label: string; share: number }[] = [
  { id: 'none', label: 'None', share: 0 },
  { id: 'small', label: 'Small', share: 0.04 },
  { id: 'medium', label: 'Medium', share: 0.08 },
  { id: 'large', label: 'Large', share: 0.14 },
];

const PREVIEW_MAX = 1100;

function fileName(deviceId: string, mode: ShotMode, ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `device-lab_${deviceId}_${mode === 'page' ? 'full-page' : mode}_${stamp}.${ext}`;
}

/** The image to export: the capture on the chosen background, with padding. */
function compose(result: CaptureResult, prefs: ScreenshotPrefs): HTMLCanvasElement {
  const src = result.canvas;
  const framed = result.transparent;
  // JPEG has no transparency, so a transparent capture is flattened onto white.
  const fill =
    !framed || prefs.background === 'transparent'
      ? prefs.format === 'jpeg' && framed
        ? '#ffffff'
        : null
      : prefs.background === 'white'
        ? '#ffffff'
        : prefs.background === 'black'
          ? '#000000'
          : prefs.color;
  const share =
    framed && prefs.background !== 'transparent'
      ? (PADDINGS.find((p) => p.id === prefs.padding)?.share ?? 0)
      : 0;
  const pad = Math.round(Math.max(src.width, src.height) * share);
  if (!fill && pad === 0) return src;
  const out = document.createElement('canvas');
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2;
  const ctx = out.getContext('2d')!;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(src, pad, pad);
  return out;
}

const toBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));

export function ScreenshotDialog({ outcome, prefs, onPrefs, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const result = outcome?.result;

  // Open when a screenshot arrives; start from the background that suits the chosen tile.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (outcome && !dialog.open) {
      setMessage('');
      if (outcome.result?.transparent) {
        if (outcome.mode === 'device' && prefs.background !== 'transparent') {
          onPrefs({ background: 'transparent' });
        } else if (outcome.mode === 'background' && prefs.background === 'transparent') {
          onPrefs({ background: 'custom' });
        }
      }
      dialog.showModal();
    } else if (!outcome && dialog.open) {
      dialog.close();
    }
    // Only when a new outcome arrives.
  }, [outcome]);

  const composed = useMemo(
    () => (result ? compose(result, prefs) : null),
    [result, prefs.format, prefs.background, prefs.color, prefs.padding],
  );

  // Draw a scaled-down preview (the full image can be many thousands of pixels tall).
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !composed) return;
    const k = Math.min(1, PREVIEW_MAX / Math.max(composed.width, composed.height));
    canvas.width = Math.max(1, Math.round(composed.width * k));
    canvas.height = Math.max(1, Math.round(composed.height * k));
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(composed, 0, 0, canvas.width, canvas.height);
  }, [composed]);

  const format = FORMATS.find((f) => f.id === prefs.format) ?? FORMATS[0]!;
  const lossy = prefs.format !== 'png';
  const showBackground = !!result?.transparent;
  const flattened = showBackground && prefs.format === 'jpeg' && prefs.background === 'transparent';
  const canCopy = window.isSecureContext && typeof ClipboardItem !== 'undefined';

  const download = async () => {
    if (!composed || !outcome) return;
    setBusy(true);
    const blob = await toBlob(composed, format.mime, lossy ? prefs.quality / 100 : undefined);
    setBusy(false);
    if (!blob) {
      setMessage(`This browser cannot save ${format.label}. Choose another format.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(outcome.deviceId, outcome.mode, format.ext);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMessage(`Saved ${a.download}`);
  };

  const copy = async () => {
    if (!composed) return;
    setBusy(true);
    try {
      // Chrome's clipboard only takes PNG images, whatever format is chosen for saving.
      const blob = await toBlob(composed, 'image/png');
      if (!blob) throw new Error('no image');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setMessage('Copied to the clipboard.');
    } catch {
      setMessage('Could not copy. Click inside the page once, then try again, or use Download.');
    } finally {
      setBusy(false);
    }
  };

  const device = outcome ? getDevice(outcome.deviceId) : undefined;

  return (
    <dialog
      ref={dialogRef}
      class="shot-dialog"
      aria-labelledby="shot-title"
      onClose={() => {
        setMessage('');
        onClose();
      }}
    >
      {outcome && (
        <div class="shot-body">
          <h2 id="shot-title">
            {outcome.error ? 'Screenshot failed' : 'Screenshot'}
            {device && <span class="shot-sub"> · {device.name}</span>}
          </h2>

          {outcome.error && <p class="form-error">{outcome.error}</p>}

          {composed && (
            <>
              <div
                class={`shot-preview${composed === result?.canvas && result?.transparent ? ' checker' : ''}${showBackground && prefs.background === 'transparent' ? ' checker' : ''}`}
              >
                <canvas ref={previewRef} aria-label="Screenshot preview" role="img" />
              </div>
              <p class="help" aria-live="polite">
                {composed.width.toLocaleString()} × {composed.height.toLocaleString()} px
                {result?.note ? ` · ${result.note}` : ''}
              </p>

              <fieldset class="shot-field">
                <legend>Format</legend>
                <div class="seg" role="radiogroup">
                  {FORMATS.map((f) => (
                    <label key={f.id} class="seg-item">
                      <input
                        type="radio"
                        name="shot-format"
                        checked={prefs.format === f.id}
                        onChange={() => onPrefs({ format: f.id })}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {lossy && (
                <label class="shot-field">
                  <span class="shot-legend">
                    Quality <output>{prefs.quality}</output>
                  </span>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={1}
                    value={prefs.quality}
                    onInput={(e) => onPrefs({ quality: Number(e.currentTarget.value) })}
                  />
                </label>
              )}

              {showBackground && (
                <>
                  <fieldset class="shot-field">
                    <legend>Background</legend>
                    <div class="seg" role="radiogroup">
                      {BACKGROUNDS.map((b) => (
                        <label key={b.id} class="seg-item">
                          <input
                            type="radio"
                            name="shot-bg"
                            checked={prefs.background === b.id}
                            onChange={() => onPrefs({ background: b.id })}
                          />
                          <span>{b.label}</span>
                        </label>
                      ))}
                      {prefs.background === 'custom' && (
                        <input
                          type="color"
                          class="shot-color"
                          aria-label="Background colour"
                          value={prefs.color}
                          onInput={(e) => onPrefs({ color: e.currentTarget.value })}
                        />
                      )}
                    </div>
                  </fieldset>
                  {prefs.background !== 'transparent' && (
                    <label class="shot-field">
                      <span class="shot-legend">Space around the device</span>
                      <select
                        value={prefs.padding}
                        onChange={(e) => onPrefs({ padding: e.currentTarget.value as ShotPadding })}
                      >
                        {PADDINGS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}

              {flattened && (
                <p class="help">JPEG has no transparency, so the background is white.</p>
              )}
              {!canCopy && (
                <p class="help">Copy needs a secure (https) page. Use Download instead.</p>
              )}
            </>
          )}

          <p class="shot-message" role="status">
            {message}
          </p>
          <div class="dialog-actions">
            <button type="button" class="dialog-btn" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
            {composed && (
              <>
                <button
                  type="button"
                  class="dialog-btn"
                  disabled={busy || !canCopy}
                  onClick={() => void copy()}
                >
                  Copy
                </button>
                <button
                  type="button"
                  class="dialog-btn primary"
                  disabled={busy}
                  onClick={() => void download()}
                  autofocus
                >
                  Download {format.label}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
