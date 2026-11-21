// Screenshot button: will offer screenshots with or without the device frame (placeholder until Step 4).
import { Icon } from './Icons';

export function ScreenshotMenu() {
  // aria-disabled (not disabled) keeps the button reachable in the toolbar's arrow-key order.
  return (
    <button
      type="button"
      class="tool"
      data-tool
      aria-label="Screenshot"
      aria-disabled="true"
      title="Screenshot (coming soon)"
    >
      <Icon name="camera" />
    </button>
  );
}
