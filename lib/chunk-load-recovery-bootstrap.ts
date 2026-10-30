/**
 * Inline bootstrap installed with next/script beforeInteractive.
 * Kept as a string so it runs before React hydrates and can catch
 * script-tag failures for `/_next/static/*` chunks.
 */
export const CHUNK_LOAD_RECOVERY_BOOTSTRAP = `(function () {
  var KEY = "evocrm:chunk-load-reload";
  function looksLikeChunk(msg, url) {
    if (url && url.indexOf("/_next/static/") !== -1) return true;
    if (!msg) return false;
    return /Loading chunk|ChunkLoadError|dynamically imported module/i.test(String(msg));
  }
  function reloadOnce() {
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch (e) {
      return;
    }
    location.reload();
  }
  window.addEventListener(
    "error",
    function (event) {
      var target = event.target;
      if (
        target &&
        target.tagName === "SCRIPT" &&
        target.src &&
        target.src.indexOf("/_next/static/") !== -1
      ) {
        reloadOnce();
        return;
      }
      if (looksLikeChunk(event.message || (event.error && event.error.message), event.filename)) {
        reloadOnce();
      }
    },
    true
  );
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var msg = reason && (reason.message || String(reason));
    if (looksLikeChunk(msg)) reloadOnce();
  });
})();`;
