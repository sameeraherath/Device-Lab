// Focus mode: a calm dark stage behind the device windows that hides the page and keeps it from being clicked.
export function Stage() {
  return (
    <div
      class="stage"
      aria-hidden="true"
      // The page behind must not scroll while the stage covers it.
      onWheel={(e) => e.preventDefault()}
    />
  );
}
