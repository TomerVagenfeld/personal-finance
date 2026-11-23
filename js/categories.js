window.PF = window.PF || {};

PF.categories = {
  all(kind) {
    const cats = PF.store.data.categories;
    return kind ? cats.filter(c => c.kind === kind) : cats.slice();
  },

  byId(id) {
    return PF.store.data.categories.find(c => c.id === id) || null;
  },

  add(name, kind) {
    const existing = PF.store.data.categories.find(c => c.name === name && c.kind === kind);
    if (existing) return existing;
    const cat = { id: PF.uid(), name, kind };
    PF.store.data.categories.push(cat);
    PF.store.touch();
    return cat;
  },

  rename(id, name) {
    const cat = PF.categories.byId(id);
    if (!cat) return;
    cat.name = name;
    PF.store.touch();
  },

  remove(id) {
    const inUse = PF.store.data.transactions.some(t => t.categoryId === id);
    if (inUse) throw new Error("לא ניתן למחוק קטגוריה שיש בה תנועות");
    PF.store.data.categories = PF.store.data.categories.filter(c => c.id !== id);
    PF.store.touch();
  },

  findByName(name, kind) {
    return PF.store.data.categories.find(c => c.name === name && (!kind || c.kind === kind)) || null;
  },

  // Folds `mergeId` into `keepId`: every transaction and learned payee rule
  // pointing at `mergeId` is repointed to `keepId`, then `mergeId` is
  // deleted. Optionally renames the surviving category (e.g. to a combined
  // name covering both). Unlike remove(), this is safe to call on a category
  // that's actually in use — that's the whole point.
  merge(keepId, mergeId, newName) {
    if (keepId === mergeId) return;
    const data = PF.store.data;
    const keep = PF.categories.byId(keepId);
    const merged = PF.categories.byId(mergeId);
    if (!keep || !merged) return;
    if (keep.kind !== merged.kind) throw new Error("לא ניתן למזג קטגוריות הכנסה והוצאה יחד");
    data.transactions.forEach(t => { if (t.categoryId === mergeId) t.categoryId = keepId; });
    Object.keys(data.payeeRules).forEach(key => { if (data.payeeRules[key] === mergeId) data.payeeRules[key] = keepId; });
    if (newName) keep.name = newName;
    data.categories = data.categories.filter(c => c.id !== mergeId);
    PF.store.touch();
  }
};

// Payee -> category learning, used by manual entry autofill and import review.
PF.payeeRules = {
  normalize(payee) {
    return (payee || "").trim().toLowerCase();
  },
  learn(payee, categoryId) {
    const key = PF.payeeRules.normalize(payee);
    if (!key) return;
    PF.store.data.payeeRules[key] = categoryId;
    PF.store.touch();
  },
  lookup(payee) {
    const key = PF.payeeRules.normalize(payee);
    return PF.store.data.payeeRules[key] || null;
  }
};
