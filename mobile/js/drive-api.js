window.PF = window.PF || {};

// Minimal Google Drive REST calls needed by the sync flow — fetch a file's
// content by id, and overwrite it, with ETag-based conflict detection so a
// concurrent desktop save isn't silently clobbered.
PF.driveApi = (function () {
  const FILES_BASE = "https://www.googleapis.com/drive/v3/files";
  const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files";

  // { text, etag } or throws on network/HTTP error (including 404/403, which
  // the caller should treat as "setup is wrong", not a transient failure).
  async function fetchFile(fileId, token) {
    const res = await fetch(`${FILES_BASE}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`שגיאה בקריאת הקובץ מ-Drive (${res.status})`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    const text = await res.text();
    const etag = res.headers.get("etag") || res.headers.get("ETag") || null;
    return { text, etag };
  }

  // Returns { success: true } | { success: false, conflict: true } | { success: false, error }
  async function uploadFile(fileId, token, jsonText, etag) {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    if (etag) headers["If-Match"] = etag;
    const res = await fetch(`${UPLOAD_BASE}/${fileId}?uploadType=media`, {
      method: "PATCH",
      headers,
      body: jsonText
    });
    if (res.status === 412) return { success: false, conflict: true };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, error: `שגיאת העלאה (${res.status}) ${body}`.trim() };
    }
    return { success: true };
  }

  // Used only during setup, to validate a pasted file id is actually
  // readable with the granted scope before committing to it.
  async function probeFile(fileId, token) {
    try {
      await fetchFile(fileId, token);
      return { ok: true };
    } catch (e) {
      return { ok: false, status: e.status, message: e.message };
    }
  }

  return { fetchFile, uploadFile, probeFile };
})();
