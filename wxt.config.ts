import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// WXT config: build setup (Preact via its Vite plugin) and the generated MV3 manifest.
// See https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 3,
  vite: () => ({
    // WXT has no official Preact module, so we use the Preact Vite preset directly.
    // Prefresh (HMR) is off: content scripts are rebuilt and reloaded, not hot-swapped.
    plugins: [preact({ prefreshEnabled: false })],
  }),
  manifest: {
    name: 'Device Lab',
    description: 'See your site on every screen.',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    // Toolbar action with no popup: clicks go to browser.action.onClicked in background.ts.
    action: {
      default_title: 'Device Lab',
      default_icon: {
        16: '/icon/16.png',
        32: '/icon/32.png',
        48: '/icon/48.png',
        128: '/icon/128.png',
      },
    },
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'declarativeNetRequestWithHostAccess',
      'sidePanel',
    ],
  },
});
