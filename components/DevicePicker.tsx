// Device button + flyout list: lets the user choose a device for the focused window.
import { useRef, useState } from 'preact/hooks';
import { devices, type DeviceType } from '@/lib/devices';
import { Icon } from './Icons';

const GROUPS: { type: DeviceType; label: string }[] = [
  { type: 'phone', label: 'Phones' },
  { type: 'tablet', label: 'Tablets' },
  { type: 'laptop', label: 'Laptops' },
];

const MENU_ID = 'device-menu';
// Native invoker commands, popover and focusgroup are not in the JSX types.
const TRIGGER_ATTRS = { commandfor: MENU_ID, command: 'toggle-popover' } as object;
const POPOVER_ATTRS = { popover: 'auto' } as object;
const FOCUSGROUP_ATTRS = { focusgroup: 'menu nomemory' } as object;

interface Props {
  value: string;
  onChange: (deviceId: string) => void;
}

export function DevicePicker({ value, onChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];

  const onToggle = (e: Event) => {
    const isOpen = (e as ToggleEvent).newState === 'open';
    setOpen(isOpen);
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!isOpen || !menu || !trigger) return;
    // Without CSS anchor positioning, place the menu beside the trigger from script.
    if (!CSS.supports('position-area', 'inline-start')) {
      const t = trigger.getBoundingClientRect();
      menu.style.left = 'auto';
      menu.style.right = `${window.innerWidth - t.left + 8}px`;
      menu.style.top = `${Math.max(8, Math.min(t.top, window.innerHeight - menu.offsetHeight - 8))}px`;
    }
    // Keyboard opens enter the menu; pointer opens leave focus on the trigger.
    if (trigger.matches(':focus-visible')) {
      (menu.querySelector<HTMLButtonElement>('[aria-current="true"]') ?? items()[0])?.focus();
    }
  };

  // Native focusgroup handles arrows in Chromium 150+; fallback for older Chrome.
  const onKeyDown = (e: KeyboardEvent) => {
    // Escape closes the popover natively; put focus back on the trigger first.
    if (e.key === 'Escape') {
      triggerRef.current?.focus();
      return;
    }
    if ('focusGroup' in HTMLElement.prototype) return;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next: number;
    if (e.key === 'ArrowDown') next = index + 1;
    else if (e.key === 'ArrowUp') next = index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    list[(next + list.length) % list.length]?.focus();
  };

  // Browsers without invoker commands: toggle from script instead.
  const onClick = () => {
    if (!('commandForElement' in HTMLButtonElement.prototype)) menuRef.current?.togglePopover();
  };

  const choose = (deviceId: string) => {
    triggerRef.current?.focus();
    menuRef.current?.hidePopover();
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
        aria-haspopup="menu"
        aria-expanded={open}
        title="Device"
        onClick={onClick}
        {...TRIGGER_ATTRS}
      >
        <Icon name="device" />
      </button>
      {/* Placed right after its trigger so no implicit aria-details is added. */}
      <div ref={menuRef} id={MENU_ID} class="flyout" onToggle={onToggle} {...POPOVER_ATTRS}>
        <div aria-labelledby="device-trigger" onKeyDown={onKeyDown} {...FOCUSGROUP_ATTRS}>
          {GROUPS.map((group) => (
            <div key={group.type} class="flyout-group">
              <div class="flyout-heading">{group.label}</div>
              {devices
                .filter((d) => d.type === group.type)
                .map((d) => (
                  <button
                    type="button"
                    class="flyout-item"
                    key={d.id}
                    aria-current={d.id === value ? 'true' : undefined}
                    onClick={() => choose(d.id)}
                  >
                    {d.name}
                    <span class="flyout-size">
                      {d.width}×{d.height}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
