// Small inline SVG icons (stroke = currentColor); decorative, so always aria-hidden.
const PATHS = {
  close: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  device: (
    <>
      <rect x="2" y="5" width="14" height="10" rx="1.5" />
      <path d="M6 19h6M9 15v4" />
      <rect x="17.5" y="9" width="4.5" height="10" rx="1" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
