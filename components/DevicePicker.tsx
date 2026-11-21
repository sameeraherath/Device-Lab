// Device button + gallery flyout: searchable, filterable, grouped cards with a small drawing of each device.
import { useEffect, useRef, useState } from 'preact/hooks';
import { FAMILIES, allDevices, type Device, type DeviceFamily } from '@/lib/devices';
import { getRecentDevices, pushRecentDevice } from '@/lib/storage';
import { CUSTOM_LIMIT } from '@/lib/customDevices';
import { DeviceThumb } from './DeviceThumb';
import { Icon } from './Icons';

const MENU_ID = 'device-menu';
// Native invoker commands and popover are not in the JSX types.
const TRIGGER_ATTRS = { commandfor: MENU_ID, command: 'toggle-popover' } as object;
const POPOVER_ATTRS = { popover: 'auto' } as object;

const CHIPS: { id: string; label: string; families: DeviceFamily[] | null }[] = [
  { id: 'all', label: 'All', families: null },
  { id: 'iphone', label: 'iPhone', families: ['iphone'] },
  { id: 'android', label: 'Android', families: ['pixel', 'samsung', 'moto', 'other-phones'] },
  { id: 'foldables', label: 'Foldables', families: ['foldables'] },
  { id: 'tablets', label: 'Tablets', families: ['tablets'] },
  { id: 'computers', label: 'Laptops & desktops', families: ['computers'] },
  { id: 'displays', label: 'Displays', families: ['displays'] },
  { id: 'custom', label: 'Custom', families: ['custom'] },
];

export function sizeLabel(d: Device): string {
  return `${d.width}×${d.height} @${d.dpr}`;
}

interface Props {
  value: string;
  onChange: (deviceId: string) => void;
  /** Custom-device actions; the related buttons are hidden when these are missing. */
  onAdd?: () => void;
  canAdd?: boolean;
  onEdit?: (device: Device) => void;
  onDelete?: (device: Device) => void;
}

export function DevicePicker({ value, onChange, onAdd, canAdd = true, onEdit, onDelete }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState('all');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Recent devices are read once when the picker mounts, and updated when you choose one.
  useEffect(() => {
    void getRecentDevices().then(setRecentIds);
  }, []);

  const q = query.trim().toLowerCase();
  const chipFamilies = CHIPS.find((c) => c.id === chip)?.families ?? null;
  const shown = allDevices().filter(
    (d) =>
      (!chipFamilies || chipFamilies.includes(d.family)) &&
      (!q || d.name.toLowerCase().includes(q)),
  );
  const customCount = allDevices().filter((d) => d.group === 'custom').length;
  const sections = FAMILIES.map((f) => ({
    ...f,
    items: shown.filter((d) => d.family === f.id),
  })).filter(
    (s) =>
      s.items.length > 0 ||
      (s.id === 'custom' && onAdd && !q && (chip === 'all' || chip === 'custom')),
  );
  const recent = !q && chip === 'all' ? allDevices().filter((d) => recentIds.includes(d.id)) : [];
  recent.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));

  const cards = () => [
    ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.flyout-item') ?? []),
  ];

  const onToggle = (e: Event) => {
    const isOpen = (e as ToggleEvent).newState === 'open';
    setOpen(isOpen);
    if (!isOpen) {
      setQuery('');
      return;
    }
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    // Without CSS anchor positioning, place the flyout beside the trigger from script.
    if (!CSS.supports('position-area', 'inline-start')) {
      const t = trigger.getBoundingClientRect();
      menu.style.left = 'auto';
      menu.style.right = `${window.innerWidth - t.left + 8}px`;
      menu.style.top = `${Math.max(8, Math.min(t.top, window.innerHeight - menu.offsetHeight - 8))}px`;
    }
    // Keyboard opens go to the search field; pointer opens leave focus on the trigger.
    if (trigger.matches(':focus-visible')) searchRef.current?.focus();
  };

  /** Moves focus to the nearest card in a direction, by the cards' positions on screen. */
  const moveFocus = (from: HTMLButtonElement, dir: 'up' | 'down') => {
    const fr = from.getBoundingClientRect();
    const fx = fr.left + fr.width / 2;
    const fy = fr.top + fr.height / 2;
    let best: HTMLButtonElement | undefined;
    let bestScore = Infinity;
    for (const c of cards()) {
      if (c === from) continue;
      const r = c.getBoundingClientRect();
      const dy = r.top + r.height / 2 - fy;
      if (dir === 'down' ? dy < 12 : dy > -12) continue;
      const score = Math.abs(dy) * 1000 + Math.abs(r.left + r.width / 2 - fx);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) best.focus();
    else if (dir === 'up') searchRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Escape closes the popover natively; put focus back on the trigger first.
    if (e.key === 'Escape') {
      triggerRef.current?.focus();
      return;
    }
    const list = cards();
    if (list.length === 0) return;
    const active = e.target as HTMLElement;
    if (active === searchRef.current) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (list.find((b) => b.getAttribute('aria-current') === 'true') ?? list[0])?.focus();
      }
      return;
    }
    const index = list.indexOf(active as HTMLButtonElement);
    if (index < 0) return;
    if (e.key === 'ArrowRight') list[Math.min(index + 1, list.length - 1)]?.focus();
    else if (e.key === 'ArrowLeft') {
      if (index === 0) searchRef.current?.focus();
      else list[index - 1]?.focus();
    } else if (e.key === 'ArrowDown') moveFocus(list[index] as HTMLButtonElement, 'down');
    else if (e.key === 'ArrowUp') moveFocus(list[index] as HTMLButtonElement, 'up');
    else if (e.key === 'Home') list[0]?.focus();
    else if (e.key === 'End') list[list.length - 1]?.focus();
    else return;
    e.preventDefault();
  };

  // Browsers without invoker commands: toggle from script instead.
  const onTriggerClick = () => {
    if (!('commandForElement' in HTMLButtonElement.prototype)) menuRef.current?.togglePopover();
  };

  const close = () => {
    triggerRef.current?.focus();
    menuRef.current?.hidePopover();
  };

  const choose = (deviceId: string) => {
    close();
    onChange(deviceId);
    void pushRecentDevice(deviceId).then(setRecentIds);
  };

  const card = (d: Device, withActions: boolean) => (
    <div class="card-wrap" key={d.id}>
      <button
        type="button"
        class="flyout-item card"
        aria-current={d.id === value ? 'true' : undefined}
        title={`${sizeLabel(d)}${d.note ? ` (${d.note})` : ''}`}
        onClick={() => choose(d.id)}
      >
        <DeviceThumb device={d} />
        <span class="flyout-name">{d.name}</span>
        <span class="flyout-size">
          {d.width}×{d.height}
        </span>
      </button>
      {withActions && d.group === 'custom' && (onEdit || onDelete) && (
        <span class="card-actions">
          {onEdit && (
            <button
              type="button"
              class="row-action"
              aria-label={`Edit ${d.name}`}
              title="Edit"
              onClick={() => onEdit(d)}
            >
              <Icon name="edit" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              class="row-action"
              aria-label={`Delete ${d.name}`}
              title="Delete"
              onClick={() => onDelete(d)}
            >
              <Icon name="trash" />
            </button>
          )}
        </span>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        id="device-trigger"
        type="button"
        class="tool"
        data-tool
        aria-label="Device"
        aria-haspopup="true"
        aria-expanded={open}
        title="Device"
        onClick={onTriggerClick}
        {...TRIGGER_ATTRS}
      >
        <Icon name="device" />
      </button>
      {/* Placed right after its trigger so no implicit aria-details is added. */}
      <div
        ref={menuRef}
        id={MENU_ID}
        class="flyout"
        aria-label="Choose device"
        onToggle={onToggle}
        onKeyDown={onKeyDown}
        {...POPOVER_ATTRS}
      >
        <input
          ref={searchRef}
          type="search"
          class="flyout-search"
          placeholder={`Search ${allDevices().length} devices`}
          aria-label="Search devices"
          autocomplete="off"
          spellcheck={false}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <div class="chips" role="group" aria-label="Filter devices">
          {CHIPS.map((c) => (
            <button
              type="button"
              key={c.id}
              class="chip"
              aria-pressed={chip === c.id}
              onClick={() => setChip(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div class="flyout-list">
          {recent.length > 0 && (
            <section class="flyout-section recent-row" aria-label="Recent">
              <h3 class="flyout-heading">Recent</h3>
              <div class="card-grid">{recent.map((d) => card(d, false))}</div>
            </section>
          )}
          {shown.length === 0 && (q !== '' || chip !== 'custom') && (
            <p class="flyout-empty">
              {q ? `No devices match “${query.trim()}”.` : 'No devices in this group.'}
            </p>
          )}
          {sections.map((section) => (
            <section
              key={section.id}
              class="flyout-section flyout-group"
              role="group"
              aria-label={section.label}
            >
              <h3 class="flyout-heading" aria-hidden="true">
                {section.label} <span class="count">{section.items.length}</span>
              </h3>
              <div class="card-grid">
                {section.items.map((d) => card(d, true))}
                {section.id === 'custom' && onAdd && (
                  <button
                    type="button"
                    class="card add flyout-add"
                    aria-disabled={!canAdd}
                    title={
                      canAdd
                        ? 'Add custom device'
                        : `Limit of ${CUSTOM_LIMIT} custom devices reached`
                    }
                    onClick={() => {
                      if (canAdd) onAdd();
                    }}
                  >
                    <span class="thumb" aria-hidden="true">
                      <span class="add-plus">+</span>
                    </span>
                    <span class="flyout-name">Add custom device</span>
                    <span class="flyout-size">
                      {Math.max(0, CUSTOM_LIMIT - customCount)} of {CUSTOM_LIMIT} left
                    </span>
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
