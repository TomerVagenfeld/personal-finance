window.PF = window.PF || {};

// One-time "connect to Drive" configuration: which Google OAuth client to
// use, and which Drive file (the real personal-finance.json) to sync
// against. Pure config/logic here — the setup SCREEN itself is rendered by
// mobile-app.js, which calls into this module.
PF.mobileSetup = (function () {
  const KEY = "pf_mobile_config";

  // Set this once after creating the OAuth Client ID in Google Cloud
  // Console (see the setup instructions) — hardcoding it here keeps the
  // "no backend" property honest (nothing server-side to configure).
  const GOOGLE_CLIENT_ID = "644525687916-5vl9li380vunv5g1babnoqkm53e3r32o.apps.googleusercontent.com";
  const GOOGLE_API_KEY = "AIzaSyBMP4unONTMEOHdY63g_N2YZ9zz0BlkGCU";

  function getConfig() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { driveFileId: null };
    } catch (e) {
      return { driveFileId: null };
    }
  }

  function saveConfig(patch) {
    const current = getConfig();
    const next = { ...current, ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }

  function isConfigured() {
    return !!getConfig().driveFileId;
  }

  function clientId() {
    return getConfig().googleClientId || GOOGLE_CLIENT_ID;
  }

  function apiKey() {
    return getConfig().googleApiKey || GOOGLE_API_KEY;
  }

  return { getConfig, saveConfig, isConfigured, clientId, apiKey, GOOGLE_CLIENT_ID, GOOGLE_API_KEY };
})();
