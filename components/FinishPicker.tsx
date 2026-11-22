// Title-bar colour picker: a swatch button that opens a radio menu of the device's official colours.
import { useEffect, useId, useRef } from 'preact/hooks';
import { finishesOf, type Device } from '@/lib/devices';
import { chooseFinish, finishFor } from '@/lib/finishes';

const hasInvokers = 'commandForElement' in HTMLButtonElement.prototype;
const hasFocusgroup = 'focusGroup' in HTMLElement.prototype;
const hasAnchorPositioning = CSS.supports('position-area: block-end');

/** Newer HTML attributes Preact's types do not know yet. */
const attrs = (a: Record<string, string>) => a as Record<string, string>;

export function FinishPicker({ device }: { device: Device }) {
  const id = useId();
  const triggerId = `finish-trigger-${id}`;
  const menuId = `finish-menu-${id}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Only keyboard opens move focus into the menu; pointer opens leave it on the trigger.
  const enterOnOpen = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finishes = finishesOf(device);
  const current = finishFor(device);

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  const isOpen = () => !!menuRef.current?.matches(':popover-open');

  const open = () => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (menu && trigger && !isOpen()) menu.showPopover({ source: trigger } as ShowPopoverOptions);
  };

  const closeAndRestore = (fromPointer: boolean) => {
    triggerRef.current?.focus({ focusVisible: !fromPointer } as FocusOptions);
    if (isOpen()) menuRef.current?.hidePopover();
  };

  useEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    const onToggle = (e: Event) => {
      const opening = (e as ToggleEvent).newState === 'open';
      trigger.setAttribute('aria-expanded', String(opening));
      if (!opening) return;
      if (!hasAnchorPositioning) placeBelow(menu, trigger);
      if (enterOnOpen.current) {
        enterOnOpen.current = false;
        const list = items();
        (list.find((b) => b.getAttribute('aria-checked') === 'true') ?? list[0])?.focus();
      } else {
        trigger.focus({ focusVisible: false } as FocusOptions);
      }
    };
    menu.addEventListener('toggle', onToggle);
    return () => {
      menu.removeEventListener('toggle', onToggle);
      clearTimeout(closeTimer.current);
    };
  }, []);

  const onTriggerClick = (e: MouseEvent) => {
    // A click with detail 0 came from the keyboard (Enter or Space): enter the menu once open.
    enterOnOpen.current = e.detail === 0 && !isOpen();
    if (hasInvokers) return; // The browser toggles the popover itself.
    e.preventDefault();
    if (isOpen()) closeAndRestore(e.detail !== 0);
    else open();
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (isOpen()) {
      items()[0]?.focus();
    } else {
      enterOnOpen.current = true;
      // click() has detail 0, so the click handler marks the menu to be entered.
      triggerRef.current?.click();
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(e.target as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeAndRestore(false);
      return;
    }
    let next = -1;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    // Native focusgroup moves with the arrow keys; this only runs where it is missing.
    else if (!hasFocusgroup && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && at >= 0) {
      next = (at + (e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
    }
    if (next < 0) return;
    e.preventDefault();
    list[next]?.focus({ preventScroll: true });
  };

  // Close when focus leaves both the menu and its trigger (Tab out).
  const onMenuFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (menuRef.current?.contains(to) || triggerRef.current === to)) return;
    if (isOpen()) menuRef.current?.hidePopover();
  };

  const pick = (finishId: string, fromPointer: boolean) => {
    chooseFinish(device.id, finishId);
    // Leave the new check mark visible for a moment before closing (radio items).
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => closeAndRestore(fromPointer), 300);
  };

  if (!current) return null;
  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        class="btn finish-trigger"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label={`Colour: ${current.name}`}
        title={`Colour: ${current.name}`}
        {...attrs({ commandfor: menuId, command: 'toggle-popover' })}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
      >
        <span class="finish-dot" style={{ background: current.swatch }} />
      </button>
      {/* Directly after its trigger, so browsers add no implicit aria-details. */}
      <div
        ref={menuRef}
        id={menuId}
        class="finish-menu"
        {...attrs({ popover: 'auto' })}
        onKeyDown={onMenuKeyDown}
        onFocusOut={onMenuFocusOut}
      >
        <div
          {...attrs({ focusgroup: 'menu nomemory' })}
          role={hasFocusgroup ? undefined : 'menu'}
          aria-labelledby={triggerId}
        >
          <div role="group" aria-label={`${device.name} colours`}>
            {finishes.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitemradio"
                aria-checked={f.id === current.id ? 'true' : 'false'}
                onPointerMove={(e) =>
                  (e.currentTarget as HTMLButtonElement).focus({
                    focusVisible: false,
                  } as FocusOptions)
                }
                onClick={(e) => pick(f.id, e.detail !== 0)}
              >
                <span class="finish-dot" style={{ background: f.swatch }} aria-hidden="true" />
                <span class="finish-name">{f.name}</span>
                {f.online && <span class="hint">Online exclusive</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Without CSS anchor positioning: place the menu below the trigger, kept inside the viewport. */
function placeBelow(menu: HTMLElement, trigger: HTMLElement) {
  const t = trigger.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const fitsBelow = t.bottom + 4 + m.height <= innerHeight;
  const top = fitsBelow ? t.bottom + 4 : Math.max(4, t.top - 4 - m.height);
  const left = Math.min(Math.max(4, t.right - m.width), innerWidth - m.width - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
