// Content script UI: will mount the floating device windows inside a Shadow DOM on the active page.
import './style.css';

export default defineContentScript({
  // Injected on demand from background.ts (activeTab + scripting), never declared in the manifest.
  registration: 'runtime',
  matches: [],
  main() {},
});
