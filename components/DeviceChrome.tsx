// Device system UI drawn over the screen: status bar (time, signal, Wi-Fi, battery) and bottom bar.
import type { BottomBarKind, StatusBarKind } from '@/lib/devices';
import { clockTime, pageDomain, statusTheme } from '@/lib/pageInfo';

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
      <path d="M8 11.5l2.6-3a3.6 3.6 0 0 0-5.2 0z" />
      <path d="M3.6 6.6a6.2 6.2 0 0 1 8.8 0l1.6-1.8a8.6 8.6 0 0 0-12 0z" />
      <path d="M0.4 3a10.8 10.8 0 0 1 15.2 0L16 2.5l-.1-.1a12 12 0 0 0-15.8 0L0 2.5z" />
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

interface StatusBarProps {
  kind: StatusBarKind;
  height: number;
}

export function StatusBar({ kind, height }: StatusBarProps) {
  if (kind === 'none' || height <= 0) return null;
  const theme = statusTheme();
  const time = clockTime();
  return (
    <div
      class="status-bar"
      data-kind={kind}
      data-fg={theme.foreground}
      style={{ height: `${height}px`, background: theme.background }}
      aria-hidden="true"
    >
      <span class="sb-time">{time}</span>
      <span class="sb-icons">
        <Signal />
        <Wifi />
        <Battery />
      </span>
    </div>
  );
}

interface BottomBarProps {
  kind: BottomBarKind;
  rotated: boolean;
}

/** Overlays the bottom of the page; decorative, so clicks pass through to the page. */
export function BottomBar({ kind, rotated }: BottomBarProps) {
  if (kind === 'none') return null;
  const showPill = kind === 'safari' && !rotated;
  return (
    <div class="bottom-bar" data-kind={kind} aria-hidden="true">
      {showPill && (
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
      <div class="home-indicator" />
    </div>
  );
}
