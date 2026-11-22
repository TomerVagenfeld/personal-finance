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
