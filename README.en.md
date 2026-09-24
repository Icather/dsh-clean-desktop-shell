<div align="center">

# dsh-clean-desktop-shell

**A clean desktop shell for DeepSeek Harness, shipped as a DSH plugin**

Does exactly one thing: wraps your already-configured DSH Web in a clean native desktop window — system tray, single instance, just like a normal app. No frosted glass, no fancy materials. **Clean.**

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-0.1.2-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Contributors](https://img.shields.io/github/contributors/Icather/dsh-clean-desktop-shell?color=blueviolet)](https://github.com/Icather/dsh-clean-desktop-shell/graphs/contributors)
[![npm downloads](https://img.shields.io/npm/dt/dsh-clean-desktop-shell?logo=npm&color=cb3837&label=npm%20downloads)](https://www.npmjs.com/package/dsh-clean-desktop-shell)
[![Installs](https://img.shields.io/github/downloads/Icather/dsh-clean-desktop-shell/total?logo=github&color=2ea043&label=installs)](https://github.com/Icather/dsh-clean-desktop-shell/releases)
[![Clones](https://img.shields.io/badge/clones-367%20%2F%2014d-8957E5?logo=github&label=clones)](https://github.com/Icather/dsh-clean-desktop-shell)

</div>

## What is this

`dsh-clean-desktop-shell` is a **DSH-plugin-shaped clean desktop shell**: it wraps an already-running DSH Web (default `http://127.0.0.1:3080`) in a native desktop window — system tray, single instance, so it behaves like any normal desktop app. **No visual changes at all**: no frosted glass, no skinning — purely a window shell.

Key differences from other desktop clients in the ecosystem:

| | Other desktop clients (e.g. dsh-desktop family) | This plugin |
|:--|:--|:--|
| **Form** | Standalone Electron app with its own profile | **DSH plugin** mounted into your existing profile |
| **Profile** | New `desktop` profile, plugins/config must be reinstalled | **Reuses your web profile**, zero migration |
| **Visual changes** | Custom title bar / frosted glass etc. | **None** — pure window shell |
| **Upstream** | Pinned version | **Adapted to DSH 0.1.2 BrowserAuth** (auto-auth on cold start; never takes over or kills an external backend) |

## Highlights

**① One-click launch — like double-clicking a normal desktop app**

No terminal, no commands. **Double-click the desktop shortcut and the DSH window opens instantly**, just like launching any normal app:

- The installer creates the desktop shortcut automatically; the plugin form asks on first run, plus a one-click "create desktop shortcut" in the tray
- Shows immediately on double-click — never waits for the backend
- Single instance: a second double-click just focuses the existing window

**② Live backend monitoring · quick manual start/stop**

The tray **shows the backend state in real time** (running / starting / stopped / error) with one-click controls:

- **Responsiveness monitoring**: the probe timeout remains 1,500 ms. A failed response is not a process exit: transient and persistent failures retain the loaded page and show a connection notice.
- **In-page recovery**: HTTP and client-runtime state are combined, and the client's own connection service resumes synchronization without automatic reloads. Automatic retries use the existing 4-second watch; manual retries share its duplicate-request guards.
- **Quick start/stop**: one-click start / restart / stop from the tray (with progress dialogs); "stop backend" really shuts the service down on 3080, including externally started instances

## Usage

1. If the plugin is installed, launching `dsh` from the command line pops up the desktop window automatically; you can also double-click the desktop shortcut created by the plugin — on par with a native desktop app.
2. Everything from the original web UI works as-is.
3. Detailed settings live in the tray right-click menu. The original page remains unchanged while connected; connection failures show a recovery notice.

**Backend lifecycle controls live in the tray**:

- Start / restart / stop the backend (with progress dialogs; stopping really shuts down the service on 3080, including externally started instances)
- Auto-detect backend · set the backend install folder (auto-detect default)
- Reload window · create desktop shortcut · check for updates · repo homepage

**Window reliability (non-destructive connection recovery):**

- Shows immediately on launch, never waits for the backend
- When no usable page exists at startup, the local offline screen remains until backend startup is ready
- Only a confirmed managed-child exit or an explicit stop of an identified backend switches back to the offline screen; an unreachable external backend remains a responsiveness failure
- Persistent failures offer retry and explicit page reload; reloading can discard unsaved page state
- The offline screen has self-service buttons: reload / start backend / auto-detect backend / set backend install folder

The shell does not recreate the loaded document after probe failures, but third-party plugins may still change their own views when handling disconnection. Confirmed exits and explicit reloads still leave the current page.

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
- **If the window still does not appear**: a failed launch writes diagnostics
  to `desktop-shell-launch.log` inside your DSH home:

  ```sh
  cat "${DSH_HOME:-$HOME/.dsh}/desktop-shell-launch.log"
  ```

  Paste the contents into an issue — it records platform, arch, Node version,
  DSH home, runtime directory and the exact error. With no window on screen,
  this is the only thing that can tell us what went wrong.

If you have a Mac and want to co-maintain macOS support (test the .dmg, set up
signing, or add a launch-at-login tray item), PRs and verified issues are very
welcome. You will be added to [CONTRIBUTORS.md](./CONTRIBUTORS.md).

## Security & permissions: what it actually does

Third-party scanners (e.g. [dsh-xray](https://github.com/unStone/dsh-xray)) rate
this project as "high capability combined with sensitive behavior". **That rating
is not a false positive** — every item is real, and every item has a concrete,
necessary reason. You should know what runs on your machine.

| Behavior | Why it is required | Where |
|:--|:--|:--|
| Spawning system commands | The shell's core job is **starting / restarting / stopping the `dsh web` backend** and probing port 3080. There is no way to do that without system commands. | `electron/service.js` |
| Downloading the ~100MB Electron runtime | Needed on first launch. Two sources race with a 3s timeout: `github.com` and `npmmirror.com` — the latter is a CN mirror that is usually much faster on Chinese networks. | `src/host/runtime.js` |
| Calling `api.github.com` | Only for the tray's "Check for updates" action, to read the latest release metadata. | `electron/update.js` |
| Reading env vars | Path resolution and feature switches only: `DSH_HOME` (DSH home), `DSH_SHELL_ELECTRON_DIR` (reuse a local Electron, skip the download), `DSH_SHELL_AUTO_LAUNCH=0` (disable auto-launch), `USERPROFILE` / `APPDATA` (locate `dsh.cmd` and the shortcuts folder on Windows). | `src/host/common.js`, `src/host/index.js`, `electron/shortcut.js` |
| Patching the DSH runtime (`cordis.patch.yml`) | **DSH's official plugin registration mechanism** — every DSH plugin mounts this way, it is not specific to this project. | `cordis.patch.yml` |

**The line it does not cross**: no telemetry, no uploads, no reading of your
conversation data. The network requests above are the only two kinds that exist,
and both can be avoided entirely by setting `DSH_SHELL_ELECTRON_DIR`.

The unsigned-installer warnings (Windows SmartScreen, macOS Gatekeeper) come from
the **absence of a code-signing certificate**, not from any of the above.

## Compatibility & runtime bounds

The "high capability" rating comes from the four capabilities listed above (files, network,
commands, credentials). Compatibility ranges, dependencies, external services and failure
bounds are declared below for human review — **a declaration is not an acceptance run**, so
every row names its evidence.

### Compatibility ranges

| Item | Declaration | Basis |
|:--|:--|:--|
| Node.js | `>=20.0.0` (`engines.node`) | The host half uses global `fetch` and `AbortSignal.timeout`; the Electron half runs on Electron 33's embedded Node 20.18. Nothing newer is required. |
| DSH | `>=0.1.1 <0.2.0` (`dsh.compatibility.dsh`) | Targets the 0.1.x plugin contract. Before 0.1.2 there is no BrowserAuth, and the host half has an explicit guard for that generation (it still launches the window, just without a bootstrap URL). |

`dsh.compatibility.dshReleases` records the tested status per release:

| DSH version | Status | Evidence |
|:--|:--|:--|
| `0.1.5-rc.1` | `compatible` | Real end-to-end: launch-token banner → plugin auto-launches the shell → the window renders the UI and stores a `dsh-auth` cookie; keep-page-on-outage and offline-screen-on-confirmed-exit both pass |
| `0.1.5-rc.2`, `0.1.5-alpha.2` | `unknown` | No runtime acceptance run |
| `0.1.1-rc.2` | `unknown` | The "pre-0.1.2" code path is asserted separately (real host module against a connection without `authenticatedUrl`), but no full acceptance run on that release |

### Dependencies & lifecycle scripts

| Kind | Content |
|:--|:--|
| Runtime deps | `electron-updater` (tray "check for updates"), `semver` (version comparison). Both are used in the Electron half only; **the host half loads no third-party dependency**. |
| Peer dep | `@deepseek-ai/dsh` (optional) — the host is provided by DSH, never installed with this package. |
| Dev deps | `electron`, `electron-builder`, `sharp`, `png-to-ico` (build and icon generation only). |
| Lifecycle scripts | **None.** This package declares no `preinstall` / `install` / `postinstall` / `prepare`; `scripts` holds only manual entries (`build` / `check` / `dev` / `icons` / `pack`). |
| Install-script exception | `pnpm.allowScripts` allows `electron`'s own postinstall (it downloads the Electron binary). That is a **dependency's** script, not this package's, and only appears when dev dependencies are installed. |

### External services

| Endpoint | When | Failure behaviour |
|:--|:--|:--|
| `github.com` / `npmmirror.com` | First-time Electron runtime provisioning; two sources race with a 3 s timeout (~100 MB) | Both fail → the window does not start, and `<DSH_HOME>/desktop-shell-launch.log` records the platform, the raw error and alternatives |
| `github.com` (rcedit) | First-time taskbar-icon patch on the runtime exe (~1.3 MB) | Capped at 20 s for the fetch and 25 s for the whole step; a timeout only costs the custom icon — **never the window** — and the next launch retries |
| `api.github.com` | Tray "check for updates" / auto-update | Fails silently; nothing else is affected |
| Anything else | None. No uploads, no conversation data, no telemetry. | — |

### Failure bounds

- **Backend will not start**: the offline screen is shown and re-probed every 2.5 s; it loads the moment the backend answers.
- **Backend drops**: the loaded page is kept with an in-page notice (no reload, no lost drafts); only a confirmed process exit or an explicit stop swaps in the offline screen.
- **Not Windows**: the taskbar-icon patch is skipped outright (first line of `patchExeIcon` is an `isWin` check).
- **`dsh` CLI not found**: point the tray at the folder, or set `DSH_BACKEND_DIR`.

### Disposable-profile acceptance record

A full install / start / uninstall cycle in a clean throwaway DSH home and profile
(**never the daily profile**), DSH `0.1.5-rc.1`, Windows 11:

| Step | Command | Result |
|:--|:--|:--|
| Install | `dsh plugin --profile web add file:<repo>` | exit 0 (pnpm 2.2 s); the plugin entry appears in `--dump-config` |
| Start | `dsh web --no-open` | launch-token banner printed; bare `/` → 401, with token → 303 + `Set-Cookie: dsh-auth-…`, with cookie → 200; the index manifest contains `dsh-clean-desktop-shell/client.js` (plugin mounted in the front end) |
| Plugin launches the window | same run | The host half completed every step: `inject(['connection'])` fired → `webServer` resolved → launch URL minted → `launchShell()` called (asserted point by point with a temporary probe). **Window visibility was not accepted on this machine**: the acceptance host is a GPU-less CI-style sandbox where Electron exits with `FATAL: GPU process isn't usable` — unrelated to this plugin (a blank Electron app with no GPU flags exits there too, and `--in-process-gpu` makes it work). Window rendering itself was verified separately with a GPU-flagged harness. |
| Uninstall | `dsh plugin --profile web remove dsh-clean-desktop-shell` | exit 0 (pnpm 1.4 s); plugin entries in `--dump-config` drop to zero |
| Rollback | Uninstall is the rollback: `dsh.profile.bundles` and `dependencies` are updated together, and backend/window behaviour returns to the uninstalled state | — |

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

`npm run check` runs syntax and Node self-checks. Running `scripts/selftest-recovery.mjs` with Electron additionally checks retry after a real spawn failure, burst retries, and immediate-failure feedback; use `--user-data-dir` with a temporary directory.

The following sh/bash example expects `ELECTRON` to name an already installed Electron executable. It uses isolated user-data, does not launch the daily application, and does not send a model request:

```sh
test -n "$ELECTRON" && "$ELECTRON" --user-data-dir="$(mktemp -d)" scripts/selftest-recovery.mjs
```

This entry exercises recovery boundaries using a temporary non-executable file and a local page on an ephemeral port; it is not a substitute for real-session or performance acceptance.

## Changelog

### 0.1.13
- Fixed a first launch that could stay windowless for minutes: the taskbar-icon patch (rcedit) reused the generic 600 s download budget, so a slow GitHub could hold the window back for ten minutes. It now has its own 20 s cap plus a 25 s deadline for the whole step, and runs in parallel with the Electron runtime download — a miss only costs the custom icon, never the window.
- Declared compatibility ranges explicitly (`engines.node: ">=20.0.0"` and `dsh.compatibility` with per-release status), plus dependencies, lifecycle scripts (none), external services, failure bounds and a disposable-profile install / start / uninstall record — meeting the DSH STORE listing contract.
- A slow backend response no longer navigates away to the offline screen: the loaded page is preserved and an in-page notice is shown, so drafts, scroll position and selection survive.
- Probe observations are separated from confirmed exits: only a real process exit or an explicit stop counts as the backend going down, and the probe keeps its 1,500 ms timeout.
- Real client connection state and the runtime's own reconnect action are bridged in (`shellAPI.connectionReport` / `onReconnectRequest`): a live HTTP port can no longer hide a dead page WebSocket, and manual plus automatic retries share one guard so an immediate failure cannot feed a reconnect loop.

### 0.1.12
- **DSH 0.1.2 BrowserAuth compatibility, plugin form included**: on plugin cold start the host defers-injects the Connection service and, after the Loader tree settles, mints this process's launch URL for Electron — first entry completes the `?token=` → Cookie exchange automatically, no manual backend restart. Until now only a shell-started backend could obtain a token; the plugin form (`dsh web` auto-launching the shell) and "start `dsh web` yourself, then open the shell" both stayed on the unauthenticated page.
- Electron-managed backend (start / restart) keeps the stdout launch-URL bootstrap: it matches the `dsh web:` banner strictly and keeps the whole `?token=` (loopback only — the token is a local-process secret), with a fallback parse for pre-0.1.2 bare URLs so those no longer degrade into a startup timeout; an externally running backend is never restarted or killed on its own.
- Fixed a startup race: the backend port answers (4xx) before Loader settlement, so the offline screen's reconnect probe no longer loads the bare URL first and loses the token bootstrap.
- "Reload window" and window reloads now use the current process's launch URL: the launch token rotates on every restart, so persisting it to `config.json` would only fail on the next restart.
- New desktop titlebar contract: page URLs carry `dsh-desktop-mode` / `dsh-desktop-platform` / `dsh-desktop-titlebar-inset` so dockable panels (better-sidebar) can yield the drag strip.
- Older DSH stays supported: before 0.1.2 there is no BrowserAuth and no launch-URL mint, so the window simply opens without a bootstrap URL instead of never opening at all.

### 0.1.10
- Version comparison now uses semver (`semver.coerce` + `semver.gt`) — the industry standard — replacing the hand-rolled tuple parser.
- All HTTP timeouts migrated to `AbortSignal.timeout` (standard self-cleaning API, no manual controller leaks).
- Config persistence switched to atomic writes (tmp + rename); a crash mid-write can no longer truncate config.json.
- Removed the developer-machine-specific hardcoded path (`D:\deepseek-harness\prod\...`); replaced with config `backendPath` + `DSH_BACKEND_DIR` env var + npm global dir candidates.
- Windows backend stop now uses `taskkill /T /F` tree kill (the old `proc.kill()` left orphan node children holding the port when the command was a .cmd shim); POSIX falls back through SIGTERM → SIGKILL gracefully.
- Shortcut management rewritten to Electron-native `shell.writeShortcutLink` / `readShortcutLink`, dropping the PowerShell + WScript COM dependency (also fixes OneDrive Desktop redirection via `app.getPath('desktop')`).
- New process-level crash guard: `uncaughtException` / `unhandledRejection` append to `userData/shell-crash.log` (128 KB cap with auto-truncation) — attachable in bug reports.
- Electron runtime zip now verified against SHASUMS256.txt post-download (SHA-256 streaming check); corrupted files are discarded and the next mirror source is tried.
- Resilience hardening: backend stdout/stderr capped at 64 KB ring buffer; config load type-validates known keys and silently drops unknown ones; offline page detection upgraded from `includes('error.html')` to precise file:// URL comparison.
- `npm run check` syntax gate expanded from 1 file (lib/index.js) to all 17 shipped JS files.

### 0.1.9
- One-click "update now" for plugin mode when a new version is found: the
  installing package manager (pnpm/npm/yarn/bun) is inferred from the lockfile
  next to the install, and a chain of command variants (with a corepack
  fallback) absorbs PATH and pnpm version differences. The on-disk version is
  verified afterwards, with success / unchanged / failure dialogs — failures
  list the attempted commands and output (copyable).
- The update dialog also shows a copyable manual command and keeps the DSH
  market entry; commands run via `shell:true` + `windowsHide` on Windows for
  `.cmd` shim and PowerShell / cmd compatibility.

### 0.1.8
- Plugin (npm-installed) mode now checks the npm registry `dist-tags.latest`
  and compares it against the local version from the same source, instead of
  wrongly querying GitHub `/releases/latest` (when the GitHub Latest tag
  lagged behind, this produced the contradictory "current 0.1.7 is up to date
  (v0.1.6)" dialog).
- The packaged desktop app still uses GitHub Releases; dropped the redundant
  version repetition in the "up to date" dialog.

### 0.1.7
- **Fixed a silent failure that made the window never open on macOS**: the
  Electron macOS archive is an `Electron.app` bundle with the binary at
  `Electron.app/Contents/MacOS/Electron`; the launcher was looking for a
  top-level `electron` (the Linux layout) and gave up without any feedback.
- Extraction now tries multiple strategies (ditto / unzip / tar) and verifies
  the payload; the executable bit is restored and the macOS quarantine
  attribute is cleared afterwards.
- Launch failures no longer vanish into the log: diagnostics are written to
  `desktop-shell-launch.log` and its full path is reported.
- macOS tray now uses a template image so it adapts to light/dark menu bars;
  the Windows-only "create desktop shortcut" item is hidden elsewhere.
- Added `CONTRIBUTORS.md` and an open call for Mac co-maintainers (signing,
  notarization, real-device verification).

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
