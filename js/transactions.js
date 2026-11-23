window.PF = window.PF || {};

// Cal/Isracard note text for an installment purchase looks like "תשלום 1
// מתוך 12" (payment 1 of 12) — this pulls that out into real fields so the
// app can reason about "how many payments are left", instead of it being
// inert free text. Returns null for anything that doesn't match.
const INSTALLMENT_NOTE_RE = /תשלום\s*(\d+)\s*מתוך\s*(\d+)/;
function parseInstallment(notes) {
  const m = INSTALLMENT_NOTE_RE.exec(notes || "");
  if (!m) return null;
  return { index: Number(m[1]), total: Number(m[2]) };
}

PF.transactions = {
  all() {
    return PF.store.data.transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  // cardIds: when provided (non-empty array), keep only rows whose cardId is
  // in the list - used to filter to "just some of the cards" rather than one.
  // unclassified: when true, keep only income/expense rows with no category.
  filter({ from, to, accountId, categoryId, type, cardIds, unclassified, search } = {}) {
    const q = search ? search.trim().toLowerCase() : "";
    return PF.transactions.all().filter(t => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (accountId && t.accountId !== accountId && t.fromAccountId !== accountId && t.toAccountId !== accountId) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (type && t.type !== type) return false;
      if (cardIds && cardIds.length && !cardIds.includes(t.cardId || "")) return false;
      // Adjustments show "התאמת יתרה" in the category column (so the row
      // isn't blank), but that's not a real category - without this they
      // looked "already classified" and leaked into this filter.
      if (unclassified && (t.type === "transfer" || t.categoryId || t.isAdjustment)) return false;
      if (q && !`${t.payee || ""} ${t.notes || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  },

  add(txn) {
    const full = {
      id: PF.uid(),
      source: "manual",
      notes: "",
      payee: "",
      categoryId: null,
      ...txn
    };
    const installment = parseInstallment(full.notes);
    if (installment) { full.installmentIndex = installment.index; full.installmentTotal = installment.total; }
    full.importHash = full.importHash || PF.transactions.hash(full);
    PF.store.data.transactions.push(full);
    if (full.payee && full.categoryId) PF.payeeRules.learn(full.payee, full.categoryId);
    PF.store.touch();
    return full;
  },

  update(id, patch) {
    const t = PF.store.data.transactions.find(x => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    if (t.payee && t.categoryId) PF.payeeRules.learn(t.payee, t.categoryId);
    PF.store.touch();
  },

  remove(id) {
    PF.store.data.transactions = PF.store.data.transactions.filter(t => t.id !== id);
    PF.store.touch();
  },

  addMany(txns) {
    for (const t of txns) {
      const full = { id: PF.uid(), source: "import", notes: "", payee: "", categoryId: null, ...t };
      const installment = parseInstallment(full.notes);
      if (installment) { full.installmentIndex = installment.index; full.installmentTotal = installment.total; }
      full.importHash = full.importHash || PF.transactions.hash(full);
      PF.store.data.transactions.push(full);
    }
    PF.store.touch();
  },

  parseInstallment,

  // Hash used for duplicate detection across imports (and re-imports of the same file).
  hash(t) {
    const key = [t.date, t.amount.toFixed(2), (t.payee || "").trim(), t.accountId || "", t.type].join("|");
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  },

  existingHashes() {
    return new Set(PF.store.data.transactions.map(t => t.importHash).filter(Boolean));
  }
};
