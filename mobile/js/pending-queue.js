window.PF = window.PF || {};

// Offline queue of not-yet-synced quick-add entries. Lives in IndexedDB (not
// localStorage) because entries need atomic add/remove-by-id and must
// survive the app being backgrounded — same reasoning as the handle store in
// js/store.js, mirrored here with its own DB/store name.
PF.pendingQueue = (function () {
  const DB_NAME = "pf_mobile_db";
  const STORE_NAME = "pending_txns";

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME, { keyPath: "localId" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    // txn: {date, amount, type, payee, accountId, categoryId, cardId}
    async add(txn) {
      const record = {
        localId: "q_" + PF.uid(),
        createdAt: new Date().toISOString(),
        status: "pending",
        txn,
        lastError: null
      };
      await withStore("readwrite", store => store.put(record));
      return record;
    },

    async all() {
      const records = await withStore("readonly", store => reqToPromise(store.getAll()));
      return (records || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    },

    async remove(localId) {
      await withStore("readwrite", store => store.delete(localId));
    },

    async markStatus(localId, status, lastError) {
      await withStore("readwrite", store => {
        const getReq = store.get(localId);
        getReq.onsuccess = () => {
          const rec = getReq.result;
          if (!rec) return;
          rec.status = status;
          rec.lastError = lastError || null;
          store.put(rec);
        };
      });
    },

    async count() {
      const all = await PF.pendingQueue.all();
      return all.length;
    }
  };
})();
