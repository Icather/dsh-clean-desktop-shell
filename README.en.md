<div align="center">

# dsh-clean-desktop-shell

**A clean frosted-glass desktop shell for DeepSeek Harness, shipped as a DSH plugin**

Reuses your existing web profile with native Mica / vibrancy window material. Shell and core are decoupled: loads the local `127.0.0.1:3080` by default, or any remote DSH service you configure.

[English](README.en.md) · [中文](README.md)

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?logo=windows&logoColor=white)](https://github.com/Icather/dsh-clean-desktop-shell)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Icather/dsh-clean-desktop-shell?color=blue)](https://github.com/Icather/dsh-clean-desktop-shell/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek_Harness-rc.7-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

</div>

## What is this

`dsh-clean-desktop-shell` is a **DSH-plugin-shaped desktop shell**: it wraps an already-running DSH Web (default `http://127.0.0.1:3080`) in a native desktop window — **Mica (Windows 11) / vibrancy (macOS) frosted glass over your wallpaper** — with system tray, single instance and auto-launch, so it behaves like any normal desktop app.

Key differences from other desktop clients in the ecosystem:

| | Other desktop clients (e.g. dsh-desktop family) | This plugin |
|:--|:--|:--|
| **Form** | Standalone Electron app with its own profile | **DSH plugin** mounted into your existing profile |
| **Profile** | New `desktop` profile, plugins/config must be reinstalled | **Reuses your web profile**, zero migration |
| **Frosted glass** | Mostly not implemented | **Native Mica / vibrancy** |
| **Upstream** | Pinned version | **Tracks rc.7** |

## Architecture

```
        ┌─────────────────── Core (dsh web / headless service) ───────────────────┐
        │  Sessions · Agent · Plugins · Memory live here, decoupled from UI       │
        └─────────────────────────────────────────────────────────────────────────┘
                              ▲
              ┌───────────────┴───────────────┐
              │  dsh-clean-desktop-shell       │
              │  Electron shell (client)       │
              │  Win: Mica · macOS: vibrancy   │
              └────────────────────────────────┘
```

- **Default**: loads the local `127.0.0.1:3080` (your configured web profile, zero migration).
- **Remote-capable**: configure any remote DSH address; the shell is just a window. Phones / Linux / other devices can reach the core via browser or PWA — the shell is never bound to a local service.

### Platform matrix

| Platform | Shell | Frosted glass | Status |
|:--|:--|:--|:--|
| Windows 11 | ✅ Electron | Mica | First release target |
| macOS | ✅ Electron | vibrancy | Planned |
| Linux | — (browser / PWA to the core) | — | Not planned |
| Termux / phone / tablet | — (headless / PWA to the core) | — | Covered by remote core access |

## Install

```sh
dsh plugin --profile web add dsh-clean-desktop-shell
```

Restart `dsh web`, then launch the shell from the tray / shortcut.

> The shell needs a reachable `dsh web` service (local or configured remote address). See Usage.

## Usage

1. Start `dsh web` (or configure a remote service address).
2. Launch the shell: it auto-detects local 3080; if not running it starts the service per configuration.
3. Window controls: minimize / maximize / close (close minimizes to tray by default).

## Development

```sh
npm install
npm run build   # build the plugin bundle
npm run pack    # package NSIS (Win) + DMG (mac)
```

## Changelog

### 0.1.0
- Initial release: Electron shell skeleton, Mica / vibrancy window material, DSH plugin mounting.

## Credits

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — the core.
- Architecture inspired by [Hermes Agent Desktop](https://github.com/NousResearch/hermes-agent)'s shell/core separation.
