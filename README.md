# Device Lab

Device Lab is a Chrome extension for seeing your site on phones, tablets and laptops without
leaving the page. Click the toolbar icon and the current page opens in floating device windows,
with a slim icon bar on the right edge of the page to pick the device, rotate and more, so you can check layouts at
real device sizes side by side.

> Status: project setup only. No features are built yet.

## Planned features

- **Floating device windows**: open the current page in one or more draggable windows sized like real devices.
- **Switch device**: change the device of any open window from a searchable list of 55 devices
  (phones, foldables, tablets, laptops & desktops, smart displays).
- **Device frames**: each device is drawn with CSS only (bezels, island / notch / punch-hole cutouts,
  laptop deck, monitor stand), from frame presets in `data/devices.json`.
- **Feels like the real device**: a status bar (time, signal, Wi-Fi, battery, in the page's
  theme colour) with the island or punch hole inside it, a Safari-style address pill or gesture
  bar at the bottom, a dark metal rim with side buttons, a camera lens in the cutout, a glass screen
  edge, a deep soft shadow, and no desktop scrollbar. The window title bar stays out of the way: it
  appears when you hover above the device, focus it with the keyboard, or drag it.
  Like a real phone, the page starts below the status bar, so the viewport height is the screen
  height minus the status bar (the width is unchanged).
- **Focus mode** (off by default): a button in the icon bar puts a calm dark stage behind the devices,
  hiding the page behind them so you can concentrate on the device. The choice is remembered.
- **Custom devices**: add up to 20 of your own (name, size, DPR, type, frame on/off); they are saved
  in `chrome.storage.local`.
- **Rotate**: flip phones, foldables and tablets between portrait and landscape (the cutout moves
  to the left edge). Laptops, desktops and smart displays do not rotate.
- **Screenshots**: capture a window with the device frame, or just the screen content without it.

## Tech stack

| Part                                     | Why                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript**                           | Types for device data and for messages between the background worker and the page catch mistakes early.                                                                                                                                                                                                          |
| **[WXT](https://wxt.dev) (Manifest V3)** | Generates the manifest from config, gives file-based entrypoints, a dev mode that launches Chrome with auto-reload, and `zip` for store uploads. MV3 is required for new Chrome extensions.                                                                                                                      |
| **Preact**                               | React-style components and hooks at about 4 kB. The UI is injected into other people's pages, so a small bundle matters. WXT has no official Preact module, so it is wired in through `@preact/preset-vite` in `wxt.config.ts`, which also aliases `react` to `preact/compat` if a React library is ever needed. |
| **Plain CSS**                            | The UI lives in a Shadow DOM, which already isolates styles, so a CSS framework adds weight without much benefit.                                                                                                                                                                                                |
| **npm**                                  | Default Node package manager; nothing extra to install.                                                                                                                                                                                                                                                          |
| **ESLint + Prettier**                    | ESLint (flat config with `typescript-eslint`) catches bugs; Prettier owns formatting so the two never conflict.                                                                                                                                                                                                  |

## Folder structure

```
entrypoints/            WXT entrypoints; each file becomes part of the extension
  background.ts         Service worker: toolbar icon click (injects the content script, header
                        rules), screenshots later
  content/
    index.tsx           Content script: mounts device windows in a Shadow DOM
    style.css           Styles for the device windows
components/             Preact UI components (DeviceWindow, Sidebar icon bar, DevicePicker flyout,
                        ScreenshotMenu, Icons)
lib/                    Non-UI logic: device list, window manager, typed messages, storage
data/
  devices.json          Device list (name, CSS size, DPR, group) and the CSS frame presets
public/icon/            Extension icons (16, 32, 48, 128 px), copied as-is into the build
wxt.config.ts           WXT and manifest configuration
eslint.config.js        ESLint flat config
.output/                Build output (generated, git-ignored)
.wxt/                   WXT generated types and tsconfig (generated, git-ignored)
```

## Permissions

| Permission                            | Why                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                           | Lets the toolbar click read and inject into the current page only.                                                                                                                                |
| `scripting`                           | Injects the content script on demand (it is never declared in the manifest).                                                                                                                      |
| `storage`                             | Remembers the last used device.                                                                                                                                                                   |
| `declarativeNetRequestWithHostAccess` | Removes `X-Frame-Options` / CSP from sub-frame requests of the current page's host, in that tab only, so the page can load inside the device windows. The rule is removed when the windows close. |

## Setup

Requires Node.js 20+ and Google Chrome.

```bash
# Install dependencies (also runs `wxt prepare` to generate types)
npm install

# Dev mode: builds, opens a fresh Chrome profile with the extension loaded, and reloads on save
npm run dev

# Production build into .output/chrome-mv3/
npm run build

# Zip the production build for the Chrome Web Store (into .output/)
npm run zip

# Checks
npm run typecheck
npm run lint
npm run format
```

### Load the unpacked extension in Chrome

Use this to try a production build in your normal Chrome profile:

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `.output/chrome-mv3` folder.
5. Pin **Device Lab** from the puzzle-piece menu so the icon stays in the toolbar.

After rebuilding, click the reload button on the extension's card.

## Device data

`data/devices.json` has two parts:

- `frames`: named presets (`iphone-island`, `iphone-notch`, `iphone-home`, `android-punch`,
  `feature-phone`, `foldable`, `dual-screen`, `tablet`, `laptop`, `laptop-notch`, `desktop`,
  `smart-display`, `simple-phone`) with `radius`, `bezel`, optional `bezelTop` / `bezelBottom`,
  `screenRadius`, `color`, and optional `cutout`, `homeButton`, `base` and `stand`. Lengths are CSS
  px at device scale.
- `devices`: `id`, `name`, `group`, `width`, `height` (CSS px; portrait for phones, foldables and
  tablets, landscape for computers and displays), `dpr`, `frame` and an optional `note`.

**DPR is shown, not emulated.** An iframe always renders at the host screen's `devicePixelRatio`, so
the listed DPR is informational (and for screenshots later). The user agent is not changed either.

## Roadmap

- Verify the Galaxy S26 viewport on a real device (currently marked "not measured").
- User-agent and DPR emulation for sites that sniff the device.
- Screenshots with and without the device frame.
- Studio (coming soon).
