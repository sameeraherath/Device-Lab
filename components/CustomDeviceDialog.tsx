// Modal dialog to add, edit or delete a custom device (native <dialog> inside the Shadow DOM).
import { useEffect, useRef, useState } from 'preact/hooks';
import { FIRST_DEVICE_ID, getDevice, type CustomType, type Device } from '@/lib/devices';
import {
  DPR_MAX,
  DPR_MIN,
  NAME_MAX,
  SIZE_MAX,
  SIZE_MIN,
  addCustomDevice,
  deleteCustomDevice,
  updateCustomDevice,
  validateCustomDevice,
  type CustomDeviceInput,
} from '@/lib/customDevices';
import { applyCustomDevices } from '@/lib/windowManager';

export type DialogMode =
  { kind: 'add' } | { kind: 'edit'; device: Device } | { kind: 'delete'; device: Device };

interface Props {
  mode: DialogMode | null;
  /** Called after the dialog closes. */
  onClose: () => void;
  /** Called with the saved device after add or edit. */
  onSaved?: (device: Device, added: boolean) => void;
  /** Element to focus when the dialog's opener is gone (it lived in the closed flyout). */
  fallbackFocus?: () => HTMLElement | null;
}

const TYPE_LABELS: Record<CustomType, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  laptop: 'Laptop',
  desktop: 'Desktop',
};

export function CustomDeviceDialog({ mode, onClose, onSaved, fallbackFocus }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (mode && dialog && !dialog.open) {
      setError('');
      dialog.showModal();
    }
  }, [mode]);

  const handleClose = async () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const choice = dialog.returnValue;
    dialog.returnValue = ''; // Esc sets no value; don't let a stale one leak into the next open.
    if (choice === 'delete' && mode?.kind === 'delete') {
      try {
        applyCustomDevices(await deleteCustomDevice(mode.device.id));
      } catch {
        // Storage failure: the device simply stays in the list.
      }
    }
    onClose();
    // The opener lived in the flyout, which is closed now; keep focus in the toolbar.
    setTimeout(() => {
      const root = dialog.getRootNode() as ShadowRoot;
      if (!root.activeElement) fallbackFocus?.()?.focus();
    }, 0);
  };

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!mode || mode.kind === 'delete' || busy) return;
    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const dprText = String(data.get('dpr') ?? '').trim();
    const input: CustomDeviceInput = {
      name: String(data.get('name') ?? ''),
      width: Number(data.get('width')),
      height: Number(data.get('height')),
      dpr: dprText === '' ? 1 : Number(dprText),
      type: String(data.get('type')) as CustomType,
      showFrame: data.get('showFrame') === 'on',
    };
    const problem = validateCustomDevice(input);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const list =
        mode.kind === 'add'
          ? await addCustomDevice(input)
          : await updateCustomDevice(mode.device.id, input);
      applyCustomDevices(list);
      const saved =
        mode.kind === 'add' ? list[list.length - 1] : list.find((d) => d.id === mode.device.id);
      if (saved) onSaved?.(saved, mode.kind === 'add');
      dialogRef.current?.close('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the device.');
    } finally {
      setBusy(false);
    }
  };

  // The name must contain more than spaces; native `required` alone accepts "   ".
  const onNameInput = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    input.setCustomValidity(input.value.trim() ? '' : 'Enter a name.');
    setError('');
  };

  const editing = mode?.kind === 'edit' ? mode.device : undefined;
  const firstName = getDevice(FIRST_DEVICE_ID).name;

  return (
    <dialog
      ref={dialogRef}
      class="custom-dialog"
      aria-labelledby="custom-dialog-title"
      onClose={() => void handleClose()}
    >
      {mode?.kind === 'delete' ? (
        <form method="dialog">
          <h2 id="custom-dialog-title">Delete “{mode.device.name}”?</h2>
          <p class="dialog-text">Windows using it will switch to {firstName}.</p>
          <div class="dialog-actions">
            <button type="submit" value="cancel" class="dialog-btn" autofocus>
              Cancel
            </button>
            <button type="submit" value="delete" class="dialog-btn danger">
              Delete
            </button>
          </div>
        </form>
      ) : mode ? (
        // key: a fresh form (and fresh default values) for every open.
        <form key={editing?.id ?? 'new'} method="dialog" onSubmit={(e) => void onSubmit(e)}>
          <h2 id="custom-dialog-title">{editing ? 'Edit custom device' : 'Add custom device'}</h2>

          <label class="field">
            <span>
              Name <span aria-hidden="true">*</span>
            </span>
            <input
              name="name"
              type="text"
              required
              maxLength={NAME_MAX}
              autocomplete="off"
              autofocus
              aria-describedby="name-help"
              defaultValue={editing?.name ?? ''}
              onInput={onNameInput}
            />
            <small id="name-help">Up to {NAME_MAX} characters.</small>
          </label>

          <div class="field-row">
            <label class="field">
              <span>
                Width <span aria-hidden="true">*</span>
              </span>
              <input
                name="width"
                type="number"
                inputMode="numeric"
                required
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={1}
                aria-describedby="size-help"
                defaultValue={editing ? String(editing.width) : ''}
                onInput={() => setError('')}
              />
            </label>
            <label class="field">
              <span>
                Height <span aria-hidden="true">*</span>
              </span>
              <input
                name="height"
                type="number"
                inputMode="numeric"
                required
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={1}
                aria-describedby="size-help"
                defaultValue={editing ? String(editing.height) : ''}
                onInput={() => setError('')}
              />
            </label>
          </div>
          <small id="size-help" class="help">
            CSS pixels, whole numbers from {SIZE_MIN} to {SIZE_MAX}.
          </small>

          <div class="field-row">
            <label class="field">
              <span>DPR</span>
              <input
                name="dpr"
                type="number"
                inputMode="decimal"
                min={DPR_MIN}
                max={DPR_MAX}
                step="any"
                placeholder="1"
                aria-describedby="dpr-help"
                defaultValue={editing ? String(editing.dpr) : ''}
                onInput={() => setError('')}
              />
              <small id="dpr-help">
                {DPR_MIN} to {DPR_MAX}, default 1.
              </small>
            </label>
            <label class="field">
              <span>Type</span>
              <select name="type">
                {(Object.keys(TYPE_LABELS) as CustomType[]).map((t) => (
                  <option value={t} key={t} selected={t === (editing?.type ?? 'phone')}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <small>Sets the frame style.</small>
            </label>
          </div>

          <label class="switch">
            <input
              name="showFrame"
              type="checkbox"
              role="switch"
              defaultChecked={editing ? editing.showFrame !== false : true}
            />
            <span>Show frame</span>
          </label>

          <p class="form-error" role="alert">
            {error}
          </p>

          <div class="dialog-actions">
            <button
              type="button"
              class="dialog-btn"
              onClick={() => dialogRef.current?.close('cancel')}
            >
              Cancel
            </button>
            <button type="submit" value="save" class="dialog-btn primary" disabled={busy}>
              {editing ? 'Save' : 'Add device'}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
