(function () {
  "use strict";

  var api = globalThis.ClaudeSessionRedirect;
  var status = document.getElementById("status");
  var error = document.getElementById("error");

  function showLoadError() {
    if (status) status.textContent = "This link cannot be opened.";
    if (error) {
      error.hidden = false;
      error.textContent = "The session link could not be checked.";
    }
  }

  if (!api || typeof api.renderSessionPage !== "function" || typeof window === "undefined" || !window.location) {
    showLoadError();
    return;
  }

  try {
    api.renderSessionPage(document, window.location.search, window.location, window);
  } catch (err) {
    showLoadError();
  }
})();
