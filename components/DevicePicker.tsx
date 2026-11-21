// Device button + flyout: searchable, grouped device list for the focused window (plus custom devices).
import { useRef, useState } from 'preact/hooks';
import { GROUPS, allDevices, type Device } from '@/lib/devices';
import { Icon } from './Icons';

const MENU_ID = 'device-menu';
// Native invoker commands and popover are not in the JSX types.
const TRIGGER_ATTRS = { commandfor: MENU_ID, command: 'toggle-popover' } as object;
const POPOVER_ATTRS = { popover: 'auto' } as object;

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

  const q = query.trim().toLowerCase();
  const devices = allDevices().filter((d) => !q || d.name.toLowerCase().includes(q));
  const groups = GROUPS.map((g) => ({
    ...g,
    items: devices.filter((d) => d.group === g.id),
  })).filter((g) => g.items.length > 0);

  const items = () => [
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

  const onKeyDown = (e: KeyboardEvent) => {
    // Escape closes the popover natively; put focus back on the trigger first.
    if (e.key === 'Escape') {
      triggerRef.current?.focus();
      return;
    }
    const list = items();
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
    let next: number;
    if (e.key === 'ArrowDown') next = (index + 1) % list.length;
    else if (e.key === 'ArrowUp') next = index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    if (next < 0) searchRef.current?.focus();
    else list[next]?.focus();
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
  };

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
          placeholder="Search devices"
          aria-label="Search devices"
          autocomplete="off"
          spellcheck={false}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <div class="flyout-list">
          {groups.length === 0 && <p class="flyout-empty">No devices match “{query.trim()}”.</p>}
          {groups.map((group) => (
            <div key={group.id} class="flyout-group" role="group" aria-label={group.label}>
              <div class="flyout-heading" aria-hidden="true">
                {group.label}
              </div>
              {group.items.map((d) => (
                <div class="flyout-row" key={d.id}>
                  <button
                    type="button"
                    class="flyout-item"
                    aria-current={d.id === value ? 'true' : undefined}
                    title={d.note ? `${d.name} (${d.note})` : d.name}
                    onClick={() => choose(d.id)}
                  >
                    <span class="flyout-name">{d.name}</span>
                    <span class="flyout-size">{sizeLabel(d)}</span>
                  </button>
                  {d.group === 'custom' && onEdit && (
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
                  {d.group === 'custom' && onDelete && (
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
                </div>
              ))}
            </div>
          ))}
        </div>
        {onAdd && (
          <button
            type="button"
            class="flyout-add"
            aria-disabled={!canAdd}
            title={canAdd ? 'Add custom device' : 'Limit of 20 custom devices reached'}
            onClick={() => {
              if (canAdd) onAdd();
            }}
          >
            + Add custom device
          </button>
        )}
      </div>
    </>
  );
}
