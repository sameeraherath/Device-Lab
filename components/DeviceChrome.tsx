// Device system UI drawn over the screen: status bar (time, signal, Wi-Fi, battery) and bottom bar.
import type { BottomBarKind, StatusBarKind, TopBarKind } from '@/lib/devices';
import { clockTime, pageDomain, type StatusTheme } from '@/lib/pageInfo';
import type { DragProps } from './dragProps';

function Signal() {
  return (
    <svg class="sb-icon" viewBox="0 0 18 12" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

function Wifi() {
  return (
    <svg class="sb-icon" viewBox="0 0 16 12" aria-hidden="true">
      {/* Three bold arcs and a dot (stroked, so all of them stay visible at small sizes). */}
      <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <path d="M1.3 4.2a9.6 9.6 0 0 1 13.4 0" />
        <path d="M3.7 6.7a6.2 6.2 0 0 1 8.6 0" />
        <path d="M6.1 9a2.9 2.9 0 0 1 3.8 0" />
      </g>
      <circle cx="8" cy="10.8" r="1.15" />
    </svg>
  );
}

function Battery() {
  return (
    <svg class="sb-icon battery" viewBox="0 0 27 13" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="12"
        rx="3.5"
        fill="none"
        stroke="currentColor"
        opacity="0.4"
      />
      <rect x="2" y="2" width="18" height="9" rx="2" />
      <path d="M25 4.5v4a2 2 0 0 0 0-4z" opacity="0.4" />
    </svg>
  );
}

/** Stroke icon used by the browser bars (24 x 24 grid). */
function Icon({ d }: { d: string }) {
  return (
    <svg class="bar-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  reload: 'M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4',
  home: 'M4 11l8-7 8 7M6 10v10h4v-6h4v6h4V10',
  dots: 'M12 5v.01M12 12v.01M12 19v.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  tune: 'M4 8h10M18 8h2M4 16h2M10 16h10M14 6v4M6 14v4',
  page: 'M5 6h14M5 12h8M5 18h14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  share: 'M12 15V4M8 8l4-4 4 4M6 12v8h12v-8',
  tabs: 'M7 4h12v12M4 8h12v12H4z',
};

interface StatusBarProps {
  kind: StatusBarKind;
  height: number;
  theme: StatusTheme;
  /** iPadOS shows the date next to the time. */
  showDate?: boolean;
  /** Makes the status bar a drag surface for the window. */
  dragProps?: DragProps;
}

export function StatusBar({ kind, height, theme, showDate, dragProps }: StatusBarProps) {
  if (kind === 'none' || height <= 0) return null;
  const now = new Date();
  const time = clockTime(now);
  // iPadOS shows the date next to the time.
  const date = showDate
    ? new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(now)
    : '';
  return (
    <div
      class="status-bar grab"
      data-kind={kind}
      data-fg={theme.foreground}
      style={{ height: `${height}px`, background: theme.background }}
      aria-hidden="true"
      {...dragProps}
    >
      <span class="sb-time">
        {time}
        {date && <span class="sb-date">{date}</span>}
      </span>
      <span class="sb-icons">
        <Signal />
        <Wifi />
        <Battery />
      </span>
    </div>
  );
}

interface TopBarProps {
  kind: TopBarKind;
  height: number;
  theme: StatusTheme;
}

/** Browser toolbar above the page; decorative, so clicks pass through. */
export function TopBar({ kind, height, theme }: TopBarProps) {
  const domain = pageDomain();
  const url = (
    <div class="tb-url">
      {kind === 'chrome' && <Icon d={ICON.tune} />}
      <span class="tb-domain">{domain}</span>
      {kind === 'safari-ipad' && <Icon d={ICON.reload} />}
    </div>
  );
  return (
    <div
      class="top-bar"
      data-kind={kind}
      data-fg={theme.foreground}
      style={{ height: `${height}px`, background: theme.background }}
      aria-hidden="true"
    >
      {kind === 'chrome' && (
        <div class="tb-row">
          <Icon d={ICON.home} />
          {url}
          <span class="tb-tabs">1</span>
          <Icon d={ICON.dots} />
        </div>
      )}
      {kind === 'chrome-tablet' && (
        <>
          <div class="tb-strip">
            <div class="tb-tab">
              <span class="tb-favicon" />
              <span class="tb-domain">{domain}</span>
              <Icon d={ICON.close} />
            </div>
            <Icon d={ICON.plus} />
          </div>
          <div class="tb-row">
            <Icon d={ICON.back} />
            <Icon d={ICON.forward} />
            <Icon d={ICON.reload} />
            {url}
            <Icon d={ICON.dots} />
          </div>
        </>
      )}
      {kind === 'safari-ipad' && (
        <div class="tb-row">
          <div class="tb-side">
            <Icon d={ICON.sidebar} />
            <Icon d={ICON.back} />
            <Icon d={ICON.forward} />
          </div>
          {url}
          <div class="tb-side">
            <Icon d={ICON.share} />
            <Icon d={ICON.plus} />
            <Icon d={ICON.tabs} />
          </div>
        </div>
      )}
    </div>
  );
}

interface BottomBarProps {
  kind: BottomBarKind;
  rotated: boolean;
  theme: StatusTheme;
}

/** Overlays the bottom of the page; decorative, so clicks pass through. */
export function BottomBar({ kind, rotated, theme }: BottomBarProps) {
  if (kind === 'none' || kind === 'nav-buttons') return null;
  const showPill = (kind === 'safari' || kind === 'safari-26') && !rotated;
  return (
    <div class="bottom-bar" data-kind={kind} data-fg={theme.foreground} aria-hidden="true">
      {showPill && kind === 'safari' && (
        <div class="safari-pill">
          <svg class="pill-icon" viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span class="pill-domain">{pageDomain()}</span>
          <svg class="pill-icon" viewBox="0 0 24 24">
            <path d="M19 12a7 7 0 1 1-2.05-4.95" />
            <path d="M19 4v4h-4" />
          </svg>
        </div>
      )}
      {showPill && kind === 'safari-26' && (
        <div class="glass-row">
          <span class="glass glass-round">
            <Icon d={ICON.back} />
          </span>
          <span class="glass glass-pill">
            <Icon d={ICON.page} />
            <span class="pill-domain">{pageDomain()}</span>
            <Icon d={ICON.reload} />
          </span>
          <span class="glass glass-round">
            <Icon d={ICON.more} />
          </span>
        </div>
      )}
      <div class="home-indicator" />
    </div>
  );
}

/** The 3-button Android navigation bar (older phones); it takes space from the page. */
export function NavButtons({ height }: { height: number }) {
  return (
    <div class="nav-buttons" style={{ height: `${height}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M17 4v16L6 12z" />
      </svg>
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="6" />
      </svg>
      <svg viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    </div>
  );
}
