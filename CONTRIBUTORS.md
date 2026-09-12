# Contributors

This project welcomes contributions — especially around platforms that the
maintainer does not use daily.

## Author

- **Icather** — Windows side, plugin architecture, backend lifecycle, CI setup.

## Contributors

- **[@lispv](https://github.com/lispv)** — DSH 0.1.2 launch-token authentication on plugin cold start (the host half mints the process's launch URL and hands it to Electron), the desktop titlebar inset contract, preserving loaded pages during backend outages, and the macOS titlebar drag-strip hit area. His commit authorships are preserved in the merged history (#5, #6).
- **[@lzd-loostone](https://github.com/lzd-loostone)** — capturing the full launch-token URL instead of only host:port, so a shell-started backend stops landing on the 401 page (#4).
- **[@e16a](https://github.com/e16a)** — the issue that pinned the black-window root cause precisely (the dropped `?token=` and `probe()` scoring a 401 as healthy); the fix followed that diagnosis directly (#2).

## Looking for help

- **macOS maintainer / co-developer**: validate the .dmg install flow,
  test Apple Silicon + Intel builds, set up code signing + notarization,
  and ideally add a launch-at-login menu item in the tray.
- **Linux maintainer**: validate the runtime provisioning and tray behavior
  on major distributions.

If you open a PR or verified issue that moves macOS support forward, add your
name here.
