window.PF = window.PF || {};

// The `drive.file` OAuth scope only covers files the app created, OR a file
// the user explicitly selected through Google's own Picker UI — a bare
// pasted file id/link is NOT enough (confirmed: it 404s even for a file the
// user owns). This wraps that Picker so the ONE-TIME "which file is this"
// step actually grants access, not just records an id.
PF.drivePicker = (function () {
  let loadPromise = null;

  function loadPickerLib() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      if (window.google && window.google.picker) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => {
        gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("טעינת ספריית הבחירה נכשלה")) });
      };
      script.onerror = () => reject(new Error("לא ניתן לטעון את ספריית הבחירה של Google - בדקו חיבור לאינטרנט"));
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  // A Google OAuth Client ID is formatted "{project_number}-{random}.apps.googleusercontent.com" —
  // the Picker builder needs that project number as its App ID (without it,
  // Google's docs note the Picker can fail with a misleading
  // "API developer key is invalid" error even when the key itself is fine).
  function projectNumberFromClientId(clientId) {
    const match = (clientId || "").match(/^(\d+)-/);
    return match ? match[1] : null;
  }

  // Resolves to the picked file's Drive id, or null if the user cancelled.
  async function pickFile({ token, apiKey, clientId }) {
    await loadPickerLib();
    return new Promise((resolve, reject) => {
      try {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setMimeTypes("application/json")
          .setMode(google.picker.DocsViewMode.LIST);
        const builder = new google.picker.PickerBuilder()
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          .addView(view)
          .setCallback(data => {
            if (data.action === google.picker.Action.PICKED) {
              resolve(data.docs[0].id);
            } else if (data.action === google.picker.Action.CANCEL) {
              resolve(null);
            }
          });
        const appId = projectNumberFromClientId(clientId);
        if (appId) builder.setAppId(appId);
        builder.build().setVisible(true);
      } catch (e) {
        reject(e);
      }
    });
  }

  return { pickFile };
})();
