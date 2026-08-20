<div align="center">

# dsh-clean-desktop-shell

**A clean desktop shell for DeepSeek Harness, shipped as a DSH plugin**

Does exactly one thing: wraps your already-configured DSH Web in a clean native desktop window — system tray, single instance, just like a normal app. No frosted glass, no fancy materials. **Clean.**

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-rc.7-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Contributors](https://img.shields.io/github/contributors/Icather/dsh-clean-desktop-shell?color=blueviolet)](https://github.com/Icather/dsh-clean-desktop-shell/graphs/contributors)

</div>

## What is this

`dsh-clean-desktop-shell` is a **DSH-plugin-shaped clean desktop shell**: it wraps an already-running DSH Web (default `http://127.0.0.1:3080`) in a native desktop window — system tray, single instance, so it behaves like any normal desktop app. **No visual changes at all**: no frosted glass, no skinning — purely a window shell.

Key differences from other desktop clients in the ecosystem:

| | Other desktop clients (e.g. dsh-desktop family) | This plugin |
|:--|:--|:--|
| **Form** | Standalone Electron app with its own profile | **DSH plugin** mounted into your existing profile |
| **Profile** | New `desktop` profile, plugins/config must be reinstalled | **Reuses your web profile**, zero migration |
| **Visual changes** | Custom title bar / frosted glass etc. | **None** — pure window shell |
| **Upstream** | Pinned version | **Tracks rc.7** |

## Install

**Option 1: download the installer from Releases (for a standalone desktop app)**

- Windows: `DSH-Clean-Desktop-Shell-Setup-<version>.exe`
- macOS: `DSH-Clean-Desktop-Shell-<version>.dmg` (Intel) or `-arm64.dmg` (Apple Silicon)

The installer **creates a desktop shortcut automatically** and provides the full desktop experience (tray). The first time you run the Windows installer you may see a SmartScreen warning — **this is normal for unsigned programs, not a virus**, see "Windows SmartScreen warning" below.

**Option 2: install as a DSH plugin (DSH ecosystem users)**

```sh
dsh plugin --profile web add dsh-clean-desktop-shell
```

Restart `dsh web` and the desktop shell window **opens automatically** (the first run prepares the Electron runtime over the network, ~1-2 minutes).

> Option 2 gives you a shell that launches alongside DSH: the window is spawned by the plugin when `dsh web` starts, with **no standalone installer / desktop icon**. For a double-clickable app with a desktop shortcut and auto-update, use Option 1. The core window experience is identical either way.

> The shell needs a reachable `dsh web` service (local or configured remote address). See Usage.

### Windows SmartScreen warning

**Why does the warning appear?**

Our installer has **no code signing certificate** (a personal open-source project — certificates cost a few hundred USD per year). Microsoft Defender SmartScreen is a **reputation system**: it decides whether a program is trusted based on download volume plus a history of clean executions. For a rarely-downloaded, unsigned `.exe` it cannot confirm reputation, so it warns. **This does not mean the file is a virus**: the project is fully open source and the binaries are built by GitHub Actions from this repository (see `.github/workflows/build.yml`).

**When Edge downloads the file:**

It may be flagged as "not commonly downloaded". To keep it:

1. Hover the download entry and click the `...` menu on the right
2. Choose **Keep**
3. Confirm with **Keep anyway**

**When you double-click the installer:**

A blue dialog appears: "Windows protected your PC" — Microsoft Defender SmartScreen prevented an unrecognized app from starting.

1. Click **More info**
2. Verify the file name is `DSH-Clean-Desktop-Shell-Setup-<version>.exe`
3. Click **Run anyway**

**Alternative: unblock the file once (recommended)**

Right-click the installer → Properties → General → tick **Unblock** at the bottom → OK. No more warnings afterwards.

Or bulk-unblock via PowerShell:

```powershell
Unblock-File -Path "$env:USERPROFILE\Downloads\DSH-Clean-Desktop-Shell-Setup-*.exe"
```

> A code signing certificate (EV or Azure Trusted Signing) would remove this warning entirely, but it costs money and is rarely worth it for individual open-source maintainers. We may adopt signing when the project allows.

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
              │                              │
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

## Usage

1. Start `dsh web` (or configure a remote service address).
2. Launch the shell: it auto-detects local 3080 — loads the page if the backend is up, otherwise shows the "backend offline" screen where you can start it in one click.
3. Drag the window by its top area (right side reserved for native buttons); close minimizes to tray by default.

**All backend controls live in the tray** — the main window stays a pure shell:

- Start / restart / stop the backend (with progress dialogs; stopping really
  shuts down the service on 3080, including externally started instances)
- Auto-detect backend · set the backend install folder (auto-detect default)
- Reload window · check for updates · repo homepage

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

### 0.1.4
- Branch 2 (plugin-market distribution) is now live: `dsh plugin add` →
  restart `dsh web` → the desktop shell opens automatically. The Electron
  runtime is self-provisioned by the plugin (local reuse / network-aware
  source selection).
- Desktop shortcut: first-run prompt + one-click "create desktop shortcut"
  in the tray (both the installer and plugin forms).
- Icons: Windows taskbar and macOS Dock show the whale icon in bare-runtime
  (plugin) mode.
- Auto-launch (login item) removed — both forms are now fully manual.

### 0.1.2
- Windows auto-update: tray "check for updates" now downloads in the
  background with progress and installs on restart (electron-updater);
  macOS keeps the manual download flow.
- Launch-time backend auto-start removed (fully manual now, no longer
  fights an explicit "stop backend").
- Contributor files added (CONTRIBUTING / CoC / SECURITY / issue & PR
  templates).
- README: Windows SmartScreen install guide; clarified that "plugin
  registration ≠ installing the desktop app".

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
- Initial release: Electron shell skeleton, system tray / single instance, DSH plugin mounting.

## Contributing

Contributions of any kind are welcome — bug fixes, features, docs. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first (project layout, dev conventions, commit style, PR flow) and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues: report privately via [SECURITY.md](SECURITY.md).

## Credits

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — the core.
- Architecture inspired by [Hermes Agent Desktop](https://github.com/NousResearch/hermes-agent)'s shell/core separation.
