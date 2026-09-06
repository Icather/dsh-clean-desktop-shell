/**
 * dsh-clean-desktop-shell — client half (web browser bundle).
 *
 * Bridges the page's DSH client-runtime connection lifecycle into the
 * Electron shell so HTTP health alone can never hide a terminal disconnect
 * (e.g. the backend restarted under the page: HTTP answers again while the
 * page's WebSocket generation is dead).
 *
 *  - ctx.connection.state ('connected' | 'connecting' | 'disconnected') is
 *    forwarded to the main process (shell:client-connection → preload
 *    shellAPI.connectionReport);
 *  - main-process reconnect requests (shell:client-reconnect →
 *    shellAPI.onReconnectRequest) call ctx.connection.reconnect() —
 *    recovery through the app's own reconnect loop, never a reload.
 *
 * The supported baseline provides ctx.connection.state / reconnect();
 * missing APIs fail activation loudly instead of degrading. A plain browser
 * (no shellAPI — no Electron shell) is the only silent case.
 */
window.__ModuleLoader__.load({
  id: 'dsh-clean-desktop-shell',
  factory: () => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    exports.inject = ['connection'];
    exports.apply = function (ctx) {
      var api = window.shellAPI;
      if (!api) return;
      var connection = ctx.connection;
      var latest = null;
      var notify = function () {
        var state = connection.state.getSnapshot();
        if (state === latest) return;
        latest = state;
        if (state === 'connected' || state === 'connecting' || state === 'disconnected') {
          api.connectionReport(state);
        }
      };
      var unsubscribe = connection.state.subscribe(notify);
      notify(); // report whatever the runtime already is — a lost initial disconnect must not be hidden
      var unregisterRequest = api.onReconnectRequest(function () {
        connection.reconnect();
      });
      ctx.effect(function () {
        return function () {
          unsubscribe();
          unregisterRequest();
        };
      });
    };
    return module.exports;
  },
});
