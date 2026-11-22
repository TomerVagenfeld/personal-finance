window.PF = window.PF || {};

// Credit cards (just a filterable tag on expense transactions - see the note
// by PF.CARD_TYPES in state.js). Mirrors PF.categories' shape/CRUD.
PF.cards = {
  all() {
    return PF.store.data.cards.slice();
  },

  byId(id) {
    return PF.store.data.cards.find(c => c.id === id) || null;
  },

  add(name, type) {
    const existing = PF.store.data.cards.find(c => c.name === name);
    if (existing) return existing;
    const card = { id: PF.uid(), name, type };
    PF.store.data.cards.push(card);
    PF.store.touch();
    return card;
  },

  rename(id, name) {
    const card = PF.cards.byId(id);
    if (!card) return;
    card.name = name;
    PF.store.touch();
  },

  remove(id) {
    const inUse = PF.store.data.transactions.some(t => t.cardId === id);
    if (inUse) throw new Error("לא ניתן למחוק כרטיס שיש בו תנועות - הסירו את השיוך מהתנועות קודם");
    PF.store.data.cards = PF.store.data.cards.filter(c => c.id !== id);
    PF.store.touch();
  },

  findByName(name) {
    return PF.store.data.cards.find(c => c.name === name) || null;
  }
};
