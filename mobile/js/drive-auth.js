window.PF = window.PF || {};

// Wraps Google Identity Services' token client (client-side only, no
// backend — the token never touches a server of ours). Important GIS
// constraint: there is NO silent background refresh of an expired access
// token — requestAccessToken() must be called from a real user gesture the
// first time, and again whenever the cached token has expired. getToken()
// below reuses an in-memory token while it's still valid and otherwise
// returns null for a non-interactive call, so the caller can show a "tap to
// finish syncing" affordance instead of looping silently.
PF.driveAuth = (function () {
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  let tokenClient = null;
  let cachedToken = null; // { access_token, expiresAt }
  let gisLoadPromise = null;

  function loadGisScript() {
    if (gisLoadPromise) return gisLoadPromise;
    gisLoadPromise = new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("לא ניתן לטעון את ספריית ההזדהות של Google - בדקו חיבור לאינטרנט"));
      document.head.appendChild(script);
    });
    return gisLoadPromise;
  }

  function ensureTokenClient(clientId) {
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => {} // overridden per-call below via a promise wrapper
    });
    return tokenClient;
  }

  function isValid(token) {
    return token && token.access_token && token.expiresAt > Date.now() + 60000; // 1 min safety margin
  }

  return {
    // interactive: true when called from a real user tap/click (required the
    // first time, and any time after the cached token has expired). Returns
    // the access token string, or null if a non-interactive call had nothing
    // valid cached (caller should surface a "tap to continue" UI instead of
    // retrying in a loop).
    async getToken({ interactive, clientId }) {
      if (isValid(cachedToken)) return cachedToken.access_token;
      if (!interactive) return null;

      await loadGisScript();
      const client = ensureTokenClient(clientId);

      return new Promise((resolve, reject) => {
        client.callback = (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          cachedToken = {
            access_token: resp.access_token,
            expiresAt: Date.now() + (Number(resp.expires_in) || 3000) * 1000
          };
          resolve(cachedToken.access_token);
        };
        client.requestAccessToken({ prompt: "" });
      });
    },

    hasValidToken() {
      return isValid(cachedToken);
    },

    clearToken() {
      cachedToken = null;
    }
  };
})();
