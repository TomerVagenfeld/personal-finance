window.PF = window.PF || {};

// Reads/writes the single JSON data file. Prefers the File System Access API
// (Chrome/Edge) so the app writes straight back to the same file on disk —
// point it at a Google-Drive-Desktop-synced folder and syncing is free.
// Falls back to manual download/upload for other browsers.
PF.persistence = (function () {
  let fileHandle = null;
  let saveTimer = null;
  const HANDLE_DB = "pf_handle_db";
  const HANDLE_STORE = "handles";

  const supportsFS = typeof window.showOpenFilePicker === "function";

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    try {
      const db = await idbOpen();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* non-fatal */ }
  }

  async function idbGet(key) {
    try {
      const db = await idbOpen();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readonly");
        const req = tx.objectStore(HANDLE_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function createNew() {
    if (!supportsFS) {
      PF.store.set(PF.migrate(PF.emptyData()));
      return { mode: "fallback" };
    }
    const handle = await window.showSaveFilePicker({
      suggestedName: "personal-finance.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    fileHandle = handle;
    await idbSet("last", handle);
    const data = PF.migrate(PF.emptyData());
    PF.store.set(data);
    await writeNow();
    return { mode: "fs", name: handle.name };
  }

  async function openExisting() {
    if (!supportsFS) throw new Error("הדפדפן שלך לא תומך בפתיחת קובץ ישירות. השתמש בייבוא קובץ.");
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    fileHandle = handle;
    await idbSet("last", handle);
    return await loadFromHandle(handle);
  }

  async function loadFromHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    const data = PF.migrate(JSON.parse(text));
    PF.store.set(data);
    return { mode: "fs", name: handle.name };
  }

  async function tryReopenLast() {
    if (!supportsFS) return null;
    const handle = await idbGet("last");
    if (!handle) return null;
    try {
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const req = await handle.requestPermission({ mode: "readwrite" });
        if (req !== "granted") return null;
      }
      fileHandle = handle;
      return await loadFromHandle(handle);
    } catch (e) {
      return null;
    }
  }

  async function writeNow() {
    if (!fileHandle || !PF.store.data) return;
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(PF.store.data, null, 2));
      await writable.close();
    } catch (e) {
      console.error("שגיאה בשמירת הקובץ", e);
    }
  }

  function scheduleSave() {
    if (!fileHandle) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 400);
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(PF.store.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "personal-finance.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function uploadJson(file) {
    return file.text().then(text => {
      const data = PF.migrate(JSON.parse(text));
      PF.store.set(data);
    });
  }

  return {
    supportsFS,
    createNew,
    openExisting,
    tryReopenLast,
    writeNow,
    scheduleSave,
    downloadJson,
    uploadJson,
    hasHandle: () => !!fileHandle
  };
})();
