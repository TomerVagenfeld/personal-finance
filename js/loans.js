window.PF = window.PF || {};

// A loan isn't a real account — it never holds money you can spend from, and
// a payment toward it is real spending that belongs in your income/expense
// totals, not an invisible transfer between two of your own pots. Debt is
// tracked here instead: `openingBalance` is the (negative) amount still owed
// as of `openingDate`, same arithmetic PF.accounts.balance() used to do, just
// walked over expense transactions tagged with this loan's id (`loanId`)
// rather than over an account's transfers. See PF.migrate() in state.js for
// the one-time conversion from the old "loan"-type account.
PF.loans = {
  all() {
    return PF.store.data.loans.slice();
  },

  byId(id) {
    return PF.store.data.loans.find(l => l.id === id) || null;
  },

  remaining(loanId) {
    const loan = PF.loans.byId(loanId);
    if (!loan) return 0;
    let total = loan.openingBalance || 0;
    for (const t of PF.store.data.transactions) {
      if (t.type === "expense" && t.loanId === loanId) total += t.amount;
    }
    return Math.round(total * 100) / 100;
  },

  // Total still owed across every loan (a positive number).
  totalRemaining() {
    return -PF.loans.all().reduce((sum, l) => sum + PF.loans.remaining(l.id), 0);
  },

  payments(loanId, from, to) {
    return PF.store.data.transactions.filter(t =>
      t.type === "expense" && t.loanId === loanId &&
      (!from || t.date >= from) && (!to || t.date <= to));
  },

  add(loan) {
    PF.store.data.loans.push({ id: PF.uid(), openingBalance: 0, openingDate: PF.todayStr(), ...loan });
    PF.store.touch();
  },

  update(id, patch) {
    const loan = PF.loans.byId(id);
    if (!loan) return;
    Object.assign(loan, patch);
    PF.store.touch();
  },

  remove(id) {
    const inUse = PF.store.data.transactions.some(t => t.loanId === id);
    if (inUse) throw new Error("לא ניתן למחוק הלוואה עם תשלומים קיימים");
    PF.store.data.loans = PF.store.data.loans.filter(l => l.id !== id);
    PF.store.touch();
  },

  // Reconcile a manual "how much do I still owe" reading to `targetRemaining`
  // (a negative number, same sign convention as remaining()) by inserting an
  // adjustment expense for the delta — same Quicken/YNAB-style reconciliation
  // PF.accounts.adjustBalanceTo() does for a real account.
  adjustTo(loanId, targetRemaining, date) {
    const loan = PF.loans.byId(loanId);
    if (!loan) return null;
    const current = PF.loans.remaining(loanId);
    const delta = Math.round((targetRemaining - current) * 100) / 100;
    if (delta === 0) return null;
    const loanCat = PF.categories.findByName("הלוואה", "expense") || PF.categories.add("הלוואה", "expense");
    const bankAcc = PF.store.data.accounts.find(a => a.type === "bank") || PF.store.data.accounts[0];
    const txn = {
      id: PF.uid(),
      date: date || PF.todayStr(),
      amount: delta,
      type: "expense",
      accountId: bankAcc ? bankAcc.id : null,
      categoryId: loanCat.id,
      loanId,
      isAdjustment: true,
      payee: "התאמת יתרת הלוואה",
      notes: `עודכן מ-${current} ל-${targetRemaining}`,
      source: "manual"
    };
    PF.store.data.transactions.push(txn);
    PF.store.touch();
    return txn;
  }
};
