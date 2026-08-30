<div align="center">

# dsh-clean-desktop-shell

**A clean desktop shell for DeepSeek Harness, shipped as a DSH plugin**

Does exactly one thing: wraps your already-configured DSH Web in a clean native desktop window — system tray, single instance, just like a normal app. No frosted glass, no fancy materials. **Clean.**

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-0.1.1--rc.2-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Contributors](https://img.shields.io/github/contributors/Icather/dsh-clean-desktop-shell?color=blueviolet)](https://github.com/Icather/dsh-clean-desktop-shell/graphs/contributors)
[![npm downloads](https://img.shields.io/npm/dt/dsh-clean-desktop-shell?logo=npm&color=cb3837&label=npm%20downloads)](https://www.npmjs.com/package/dsh-clean-desktop-shell)
[![Installs](https://img.shields.io/github/downloads/Icather/dsh-clean-desktop-shell/total?logo=github&color=2ea043&label=installs)](https://github.com/Icather/dsh-clean-desktop-shell/releases)
[![Clones](https://img.shields.io/badge/clones-139%20%2F%2014d-8957E5?logo=github&label=clones)](https://github.com/Icather/dsh-clean-desktop-shell)

</div>

## What is this

`dsh-clean-desktop-shell` is a **DSH-plugin-shaped clean desktop shell**: it wraps an already-running DSH Web (default `http://127.0.0.1:3080`) in a native desktop window — system tray, single instance, so it behaves like any normal desktop app. **No visual changes at all**: no frosted glass, no skinning — purely a window shell.

Key differences from other desktop clients in the ecosystem:

| | Other desktop clients (e.g. dsh-desktop family) | This plugin |
|:--|:--|:--|
| **Form** | Standalone Electron app with its own profile | **DSH plugin** mounted into your existing profile |
| **Profile** | New `desktop` profile, plugins/config must be reinstalled | **Reuses your web profile**, zero migration |
| **Visual changes** | Custom title bar / frosted glass etc. | **None** — pure window shell |
| **Upstream** | Pinned version | **Tracks 0.1.1-rc.2** |

## Highlights

**① One-click launch — like double-clicking a normal desktop app**

No terminal, no commands. **Double-click the desktop shortcut and the DSH window opens instantly**, just like launching any normal app:

- The installer creates the desktop shortcut automatically; the plugin form asks on first run, plus a one-click "create desktop shortcut" in the tray
- Shows immediately on double-click — never waits for the backend
- Single instance: a second double-click just focuses the existing window

**② Live backend monitoring · quick manual start/stop**

The tray **shows the backend state in real time** (running / starting / stopped / error) with one-click controls:

- **Live monitoring**: the window keeps probing the backend; the moment it is killed, crashes or is stopped, the window flips to the offline screen — a stale page never fakes "still alive"
- **Auto-reconnect**: the instant the backend recovers, the window reloads the real page by itself
- **Quick start/stop**: one-click start / restart / stop from the tray (with progress dialogs); "stop backend" really shuts the service down on 3080, including externally started instances

## Usage

1. If the plugin is installed, launching `dsh` from the command line pops up the desktop window automatically; you can also double-click the desktop shortcut created by the plugin — on par with a native desktop app.
2. Everything from the original web UI works as-is.
3. Detailed settings live in the tray right-click menu. The main window adds no controls of its own, keeping the page clean.

**All backend controls live in the tray** — the main window stays a pure shell:

- Start / restart / stop the backend (with progress dialogs; stopping really shuts down the service on 3080, including externally started instances)
- Auto-detect backend · set the backend install folder (auto-detect default)
- Reload window · create desktop shortcut · check for updates · repo homepage

**Window reliability (Edge-style instant refresh):**

- Shows immediately on launch, never waits for the backend
- While the backend is down, a local "backend offline" screen is shown and re-probed; the real page loads automatically the moment it answers
- The instant the backend stops (tray stop, kill or crash) the window flips back to the offline screen — a stale page never fakes "still alive"
- The offline screen has self-service buttons: reload / start backend / auto-detect backend / set backend install folder

## macOS status (v0.1.7 important note)

v0.1.7 fixes the plugin-mode bug where the shell could not locate `Electron.app`
on macOS, which caused the window to fail silently on Mac.

However, **the maintainer does not currently have a Mac** to verify the
following in person:

- **The .dmg is unsigned and un-notarized**: Apple requires a yearly Developer
  Program membership ($99/yr) for code signing + notarization. The first time you
  open the app from the .dmg, Gatekeeper will likely say the app is "damaged"
  or "cannot be verified".
  - Workaround: run `xattr -cr "/Applications/DSH Clean Desktop Shell.app"`,
    then right-click the app and choose Open.
  - Long-term fix: a Mac co-maintainer with an Apple Developer account can help
    set up signed + notarized builds.
- Post-extract executable bits and quarantine extended attributes can only be
  confirmed on real hardware.

If you have a Mac and want to co-maintain macOS support (test the .dmg, set up
signing, or add a launch-at-login tray item), PRs and verified issues are very
welcome. You will be added to [CONTRIBUTORS.md](./CONTRIBUTORS.md).

## Install

**Option 1: download the installer from Releases (for a standalone desktop app)**

- Windows: `DSH-Clean-Desktop-Shell-Setup-<version>.exe`
- macOS: `DSH-Clean-Desktop-Shell-<version>.dmg` (Intel) or `-arm64.dmg` (Apple Silicon)

The installer **creates a desktop shortcut automatically** and provides the full desktop experience (tray).

- **Windows**: the first time you run the installer you may see a SmartScreen
  warning — **this is normal for unsigned programs, not a virus**, see
  "Windows SmartScreen warning" below.
- **macOS**: the .dmg is unsigned / un-notarized and may trigger Gatekeeper.
  See "macOS status" above.

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
        ┌────────────── Core (dsh web / headless service) ──────────────┐
        │    Sessions · Agent · Plugins · Memory live here,            │
        │    decoupled from the UI                                     │
        └───────────────────────────┬───────────────────────────────────┘
                                    │  http://127.0.0.1:3080 (or remote)
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │            dsh-clean-desktop-shell (Electron shell)       │
        │      tray · single-instance · offline auto-reconnect      │
        │      · desktop shortcut                                    │
        │                                                           │
        │    One shell codebase, two distribution forms:            │
        │     ├─ Installer: standalone exe, auto-update             │
        │     └─ Plugin: auto-pops on dsh web start                 │
        │        (self-managed Electron runtime)                     │
        └───────────────────────────────────────────────────────────┘
```

- **Shell / core separation**: the shell handles only the window, tray and backend management; sessions, agents, plugins and memory all live in the core, decoupled from the UI.
- **Default**: loads the local `127.0.0.1:3080` (your configured web profile, zero migration).
- **Remote-capable**: configure any remote DSH address; the shell is just a window. Phones / Linux / other devices can reach the core via browser or PWA — the shell is never bound to a local service.
- **One shell codebase, two distribution forms**: the installer (standalone exe) and the plugin (launches with `dsh web`) share the same `electron/` code — only the runtime source and launch differ (see Install).

## Platform matrix

| Platform | Shell | Status |
|:--|:--|:--|
| Windows | ✅ Electron (frameless + native window buttons) | Released (NSIS installer) |
| macOS | ✅ Electron (hiddenInset) | Released (CI builds Intel + Apple Silicon DMG) |
| Linux | — (browser / PWA to the core) | Not planned |
| Termux / phone / tablet | — (headless / PWA to the core) | Covered by remote core access |

## Development

```sh
npm install
npm run build   # build the plugin bundle
npm run dev     # launch the shell (dev mode)
npm run pack    # package NSIS (Win) / DMG (mac)
```

## Changelog

### 0.1.6
- Fixed "check for updates" reporting the Electron runtime version in plugin mode.

### 0.1.5
- Refactored the plugin host half into focused modules.
- Completed package.json metadata (repository / homepage / bugs); dropped a stale auto-launch field.
- README: usage before install, architecture reflects the two forms, platform matrix top-level.

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
