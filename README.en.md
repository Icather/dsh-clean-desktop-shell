<div align="center">

# dsh-clean-desktop-shell

**A clean desktop shell for DeepSeek Harness, shipped as a DSH plugin**

Does exactly one thing: wraps your already-configured DSH Web in a clean native desktop window — system tray, single instance, auto-launch, just like a normal app. No frosted glass, no fancy materials. **Clean.**

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-rc.7-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

</div>

## What is this

`dsh-clean-desktop-shell` is a **DSH-plugin-shaped clean desktop shell**: it wraps an already-running DSH Web (default `http://127.0.0.1:3080`) in a native desktop window — system tray, single instance, auto-launch, so it behaves like any normal desktop app. **No visual changes at all**: no frosted glass, no skinning — purely a window shell.

Key differences from other desktop clients in the ecosystem:

| | Other desktop clients (e.g. dsh-desktop family) | This plugin |
|:--|:--|:--|
| **Form** | Standalone Electron app with its own profile | **DSH plugin** mounted into your existing profile |
| **Profile** | New `desktop` profile, plugins/config must be reinstalled | **Reuses your web profile**, zero migration |
| **Visual changes** | Custom title bar / frosted glass etc. | **None** — pure window shell |
| **Upstream** | Pinned version | **Tracks rc.7** |

## Architecture

```
        ┌─────────────────── Core (dsh web / headless service) ───────────────────┐
        │  Sessions · Agent · Plugins · Memory live here, decoupled from UI       │
        └─────────────────────────────────────────────────────────────────────────┘
                              ▲
              ┌───────────────┴───────────────┐
              │   dsh-clean-desktop-shell      │
              │   Electron shell (client)      │
              │   tray · single-instance ·     │
              │   auto-launch                  │
              └────────────────────────────────┘
```

- **Default**: loads the local `127.0.0.1:3080` (your configured web profile, zero migration).
- **Remote-capable**: configure any remote DSH address; the shell is just a window. Phones / Linux / other devices can reach the core via browser or PWA — the shell is never bound to a local service.

### Platform matrix

| Platform | Shell | Status |
|:--|:--|:--|
| Windows | ✅ Electron (frameless + native window buttons) | Released (NSIS installer) |
| macOS | ✅ Electron (hiddenInset) | Released (CI builds Intel + Apple Silicon DMG) |
| Linux | — (browser / PWA to the core) | Not planned |
| Termux / phone / tablet | — (headless / PWA to the core) | Covered by remote core access |

## Install

```sh
dsh plugin --profile web add dsh-clean-desktop-shell
```

Restart `dsh web`, then launch the shell from the tray / shortcut.

> The shell needs a reachable `dsh web` service (local or configured remote address). See Usage.

## Usage

1. Start `dsh web` (or configure a remote service address).
2. Launch the shell: it auto-detects local 3080; if not running it starts the service per configuration.
3. Drag the window by its top area (right side reserved for native buttons); close minimizes to tray by default.

**All backend controls live in the tray** — the main window stays a pure shell:

- Start / restart / stop the backend (with progress dialogs; stopping really
  shuts down the service on 3080, including externally started instances)
- Auto-detect backend · set the backend install folder (auto-detect default)
- Reload window · check for updates · repo homepage · auto-launch

**Window reliability (Edge-style instant refresh):**

- Shows immediately on launch, never waits for the backend
- While the backend is down, a local "backend offline" screen is shown and
  re-probed; the real page loads automatically the moment it answers
- The instant the backend stops (tray stop, kill or crash) the window flips
  back to the offline screen — a stale page never fakes "still alive"
- The offline screen has self-service buttons: reload / start backend /
  auto-detect backend / set backend install folder

## Development

```sh
npm install
npm run build   # build the plugin bundle
npm run dev     # launch the shell (dev mode)
npm run pack    # package NSIS (Win) / DMG (mac)
```

## Changelog

### 0.1.1
- Backend lifecycle: fixed `spawn EINVAL` / stuck "starting" on Windows;
  "stop backend" now really shuts the service down (including externally
  started instances); start/restart/stop show progress dialogs.
- Window reliability: shows instantly on double-click; flips to the offline
  screen the moment the backend stops; auto-reconnects when it comes back
  (Edge-style instant refresh).
- Offline screen self-service: reload / start backend / auto-detect backend /
  set backend install folder.
- Tray: new "reload window" item; macOS builds released (Intel + Apple
  Silicon DMG).

### 0.1.0
- Initial release: Electron shell skeleton, system tray / single instance / auto-launch, DSH plugin mounting.

## Credits

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — the core.
- Architecture inspired by [Hermes Agent Desktop](https://github.com/NousResearch/hermes-agent)'s shell/core separation.
