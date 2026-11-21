// Slim translucent icon bar on the right edge; controls the focused (top) device window.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CUSTOM_LIMIT } from '@/lib/customDevices';
import { canRotate, getCustomDevices, getDevice } from '@/lib/devices';
import { MAX_WINDOWS, closeAll, open, update, type DeviceWindowState } from '@/lib/windowManager';
import { CustomDeviceDialog, type DialogMode } from './CustomDeviceDialog';
import { DevicePicker } from './DevicePicker';
import { Icon } from './Icons';
import { ScreenshotMenu } from './ScreenshotMenu';

interface Props {
  windows: readonly DeviceWindowState[];
}

export function Sidebar({ windows }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const selected = windows.reduce<DeviceWindowState | undefined>(
    (top, w) => (!top || w.z > top.z ? w : top),
    undefined,
  );
  const atMax = windows.length >= MAX_WINDOWS;
  const rotatable = selected ? canRotate(getDevice(selected.deviceId)) : false;

  // Clear the live-region message once it has been announced.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(''), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  // Roving tab stop (one Tab stop for the whole bar) where native focusgroup is missing.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return;
    const items = [...bar.querySelectorAll<HTMLButtonElement>('[data-tool]')];
    items.forEach((item, i) => (item.tabIndex = i === 0 ? 0 : -1));
    const onFocusIn = (e: FocusEvent) => {
      if (items.includes(e.target as HTMLButtonElement)) {
        items.forEach((item) => (item.tabIndex = item === e.target ? 0 : -1));
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const index = items.indexOf(e.target as HTMLButtonElement);
      if (index < 0) return;
      let next: number;
      if (e.key === 'ArrowDown') next = index + 1;
      else if (e.key === 'ArrowUp') next = index - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else return;
      e.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [selected !== undefined]);

  if (!selected) return null;

  return (
    <div
      ref={barRef}
      class="sidebar"
      role="toolbar"
      aria-label="Device Lab"
      aria-orientation="vertical"
      {...({ focusgroup: 'toolbar wrap block' } as object)}
    >
      <button
        type="button"
        class="tool"
        data-tool
        aria-label="Close Device Lab"
        title="Close all windows"
        onClick={closeAll}
      >
        <Icon name="close" />
      </button>
      <span class="sep" role="separator" aria-orientation="horizontal" />
      <DevicePicker
        value={selected.deviceId}
        onChange={(deviceId) => {
          update(selected.id, { deviceId });
          setStatus(`Device set to ${getDevice(deviceId).name}`);
        }}
        onAdd={() => setDialog({ kind: 'add' })}
        canAdd={getCustomDevices().length < CUSTOM_LIMIT}
        onEdit={(device) => setDialog({ kind: 'edit', device })}
        onDelete={(device) => setDialog({ kind: 'delete', device })}
      />
      <button
        type="button"
        class="tool"
        data-tool
        aria-label="Rotate"
        aria-disabled={!rotatable}
        title={rotatable ? 'Rotate' : 'Rotation not available for this device'}
        onClick={() => {
          if (!rotatable) return;
          update(selected.id, { rotated: !selected.rotated });
          setStatus(`Rotated to ${selected.rotated ? 'portrait' : 'landscape'}`);
        }}
      >
        <Icon name="rotate" />
      </button>
      <button
        type="button"
        class="tool"
        data-tool
        aria-label="New window"
        aria-disabled={atMax}
        title={atMax ? `Maximum ${MAX_WINDOWS} windows` : 'New window'}
        onClick={() => {
          if (!atMax) open();
        }}
      >
        <Icon name="plus" />
      </button>
      <span class="sep" role="separator" aria-orientation="horizontal" />
      <ScreenshotMenu />
      <span class="sep" role="separator" aria-orientation="horizontal" />
      <button
        type="button"
        class="tool"
        data-tool
        aria-label="Studio (coming soon)"
        aria-disabled="true"
        title="Studio (coming soon)"
      >
        <Icon name="studio" />
        <span class="badge" aria-hidden="true">
          Soon
        </span>
      </button>
      <CustomDeviceDialog
        mode={dialog}
        onClose={() => setDialog(null)}
        onSaved={(device, added) => {
          // A newly added device is applied to the focused window right away.
          if (added) update(selected.id, { deviceId: device.id });
          setStatus(added ? `Added ${device.name}` : `Saved ${device.name}`);
        }}
        fallbackFocus={() => barRef.current?.querySelector<HTMLElement>('#device-trigger') ?? null}
      />
      <p class="visually-hidden" role="status">
        {status}
      </p>
    </div>
  );
}
