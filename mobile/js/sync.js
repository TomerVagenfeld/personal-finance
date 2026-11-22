window.PF = window.PF || {};

// Orchestrates one sync pass: fetch the latest Drive copy, replay the
// offline queue through the EXACT SAME PF.transactions.add() desktop uses
// (so ids/dedupe-hashes/payeeRules stay consistent), upload the merged
// result back with an If-Match ETag guard, then clear the queue and refresh
// the local mirror. See the plan doc for the full rationale.
PF.sync = (function () {
  let syncing = false;
  let lastStatus = { state: "idle" }; // {state: "idle"|"syncing"|"done"|"needs_tap"|"error", message}
  let listener = null; // single slot, not a growing list — this is a single-screen app;
                        // each render() replaces whoever's currently listening rather than
                        // accumulating closures over stale, detached DOM elements.

  function setStatus(status) {
    lastStatus = status;
    if (listener) listener(status);
  }

  function onStatusChange(fn) {
    listener = fn;
  }

  // interactive: true when invoked from a real tap (lets a first-time or
  // expired OAuth token prompt the user); false for automatic triggers
  // (online event, app foreground) where GIS cannot silently refresh.
  async function run({ interactive } = {}) {
    if (syncing) return lastStatus;
    if (!navigator.onLine) { setStatus({ state: "idle", message: "אין חיבור לאינטרנט" }); return lastStatus; }
    const cfg = PF.mobileSetup.getConfig();
    if (!cfg.driveFileId) { setStatus({ state: "needs_setup" }); return lastStatus; }

    syncing = true;
    setStatus({ state: "syncing" });
    try {
      const token = await PF.driveAuth.getToken({ interactive, clientId: PF.mobileSetup.clientId() });
      if (!token) {
        setStatus({ state: "needs_tap", message: "ההתחברות פגה - יש ללחוץ על \"סנכרן עכשיו\" כדי להמשיך" });
        return lastStatus;
      }

      const { text, etag } = await PF.driveApi.fetchFile(cfg.driveFileId, token);
      const driveData = PF.migrate(JSON.parse(text));
      PF.store.set(driveData);

      const queue = await PF.pendingQueue.all();
      const failedIds = new Set();
      for (const rec of queue) {
        try {
          // A category picked (or freshly typed) offline is stored by
          // name/kind, not a raw id — the id it got offline was generated
          // against the stale local mirror and may not exist in the fresh
          // data just fetched. Resolving by name here is idempotent:
          // PF.categories.add() returns the existing category if one by
          // that name/kind already exists, or creates it if not.
          const { categoryName, categoryKind, ...txn } = rec.txn;
          if (categoryName) {
            const cat = PF.categories.findByName(categoryName, categoryKind) || PF.categories.add(categoryName, categoryKind);
            txn.categoryId = cat.id;
          }
          PF.transactions.add({ ...txn, source: "mobile" });
        } catch (e) {
          failedIds.add(rec.localId);
          await PF.pendingQueue.markStatus(rec.localId, "failed", String(e && e.message || e));
        }
      }

      const upload = await PF.driveApi.uploadFile(cfg.driveFileId, token, JSON.stringify(PF.store.data, null, 2), etag);
      if (upload.conflict) {
        setStatus({ state: "needs_tap", message: "הקובץ השתנה בינתיים - ננסה שוב בסנכרון הבא" });
        return lastStatus;
      }
      if (!upload.success) {
        setStatus({ state: "error", message: upload.error });
        return lastStatus;
      }

      for (const rec of queue) {
        if (!failedIds.has(rec.localId)) await PF.pendingQueue.remove(rec.localId);
      }
      PF.localMirror.save({
        accounts: PF.store.data.accounts,
        categories: PF.store.data.categories,
        cards: PF.store.data.cards,
        driveFileId: cfg.driveFileId,
        syncedAt: new Date().toISOString()
      });

      const failedCount = failedIds.size;
      setStatus({
        state: "done",
        message: failedCount
          ? `סונכרן בהצלחה (${queue.length - failedCount} תנועות, ${failedCount} נכשלו)`
          : `סונכרן בהצלחה (${queue.length} תנועות)`
      });
      return lastStatus;
    } catch (e) {
      setStatus({ state: "error", message: "שגיאת סנכרון: " + (e && e.message || e) });
      return lastStatus;
    } finally {
      syncing = false;
      PF.store.data = null; // don't keep the full dataset resident between syncs
    }
  }

  return { run, onStatusChange, getStatus: () => lastStatus, isSyncing: () => syncing };
})();
