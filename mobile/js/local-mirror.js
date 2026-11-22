window.PF = window.PF || {};

// Read-only, last-known snapshot of accounts/categories/cards — small enough
// for localStorage. Lets the quick-add form's dropdowns render fully offline
// (via the SAME PF.ui.accountOptions()/categoryOptions()/cardOptions()
// helpers desktop uses) without ever needing to reach Drive just to draw the
// form. Only ever overwritten wholesale right after a successful sync — the
// quick-add screen itself never mutates it.
PF.localMirror = (function () {
  const KEY = "pf_mobile_mirror";

  return {
    get() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    save({ accounts, categories, cards, driveFileId, syncedAt }) {
      const snapshot = { accounts, categories, cards, driveFileId, syncedAt: syncedAt || new Date().toISOString() };
      try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch (e) { /* storage full/unavailable — non-fatal */ }
      return snapshot;
    },

    // Builds a minimal PF.store.data-shaped object from the mirror so the
    // existing PF.ui option-builder helpers (which only read
    // PF.store.data.accounts/categories/cards) work unmodified while offline.
    toStoreData() {
      const mirror = PF.localMirror.get();
      return {
        accounts: (mirror && mirror.accounts) || [],
        categories: (mirror && mirror.categories) || [],
        cards: (mirror && mirror.cards) || [],
        transactions: [],
        loans: [],
        importProfiles: [],
        payeeRules: {}
      };
    }
  };
})();
