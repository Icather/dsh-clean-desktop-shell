/**
 * dsh-clean-desktop-shell — client half (web browser bundle).
 *
 * The shell is a standalone Electron window; it injects nothing into the
 * dsh web UI. This client module exists only to satisfy the client-modules
 * loader contract — a bundle's client entry must register itself via
 * `window.__ModuleLoader__.load({ id, factory })`, otherwise dsh reports
 * "loaded without registering … via __ModuleLoader__.load".
 */
window.__ModuleLoader__.load({
  id: 'dsh-clean-desktop-shell',
  factory: () => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    exports.apply = () => {};
    return module.exports;
  },
});
