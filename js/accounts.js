window.PF = window.PF || {};

// Current balance = openingBalance + sum of every transaction ever recorded
// against this account (NOT date-gated by openingDate — openingDate is just
// informational, since historical/imported transactions commonly predate the
// day the account was added to the app). Income/expense touch `accountId`;
// transfers touch `fromAccountId` (money out) and `toAccountId` (money in).
PF.accounts = {
  balance(accountId) {
    const data = PF.store.data;
    const acc = data.accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    let total = acc.openingBalance || 0;
    for (const t of data.transactions) {
      if (t.type === "income" && t.accountId === accountId) total += t.amount;
      else if (t.type === "expense" && t.accountId === accountId) total -= t.amount;
      else if (t.type === "transfer") {
        if (t.fromAccountId === accountId) total -= t.amount;
        if (t.toAccountId === accountId) total += t.amount;
      }
    }
    return Math.round(total * 100) / 100;
  },

  // True net worth: every tracked account, minus whatever's still owed on
  // any loan (a loan isn't an account — see PF.loans — but it's still debt).
  netWorth() {
    const data = PF.store.data;
    return data.accounts.reduce((sum, a) => sum + PF.accounts.balance(a.id), 0) - PF.loans.totalRemaining();
  },

  // Account types kept OUT of the headline "total balance" by design choice:
  // the shared account isn't solely yours — you can move money there and see
  // its balance, but it's not counted as part of "how much money do I have"
  // — and an "external" account isn't a real account at all, just the other
  // side of a transfer that actually leaves your tracked money (e.g. to
  // another person). Both still show their own balance where relevant, and a
  // transfer into either still reduces the headline total (money leaving
  // what you count as yours). A loan debt isn't in this list at all anymore
  // — it's not an account, see PF.loans.
  EXCLUDED_FROM_TOTAL: ["shared_bank", "external"],

  liquidTotal() {
    const data = PF.store.data;
    return data.accounts.filter(a => !PF.accounts.EXCLUDED_FROM_TOTAL.includes(a.type))
      .reduce((sum, a) => sum + PF.accounts.balance(a.id), 0);
  },

  // Total sitting in shared account(s) — tracked, but not "yours" for the total.
  sharedTotal() {
    const data = PF.store.data;
    return data.accounts.filter(a => a.type === "shared_bank").reduce((sum, a) => sum + PF.accounts.balance(a.id), 0);
  },

  // How much YOU personally moved into this account via transfers (every
  // transfer's "to" side is always one of your own tracked accounts, so this
  // is unambiguous). For a shared account, the gap between this and the
  // account's current balance is money that came from elsewhere - your
  // partner's own contributions, or joint spending neither of you has logged
  // here yet - which isn't broken out, just netted into that gap.
  transfersIn(accountId) {
    const data = PF.store.data;
    return Math.round(
      data.transactions.filter(t => t.type === "transfer" && t.toAccountId === accountId).reduce((s, t) => s + t.amount, 0) * 100
    ) / 100;
  },

  all() {
    return PF.store.data.accounts.slice();
  },

  add(account) {
    const data = PF.store.data;
    data.accounts.push({ id: PF.uid(), openingBalance: 0, openingDate: PF.todayStr(), ...account });
    PF.store.touch();
  },

  update(id, patch) {
    const data = PF.store.data;
    const acc = data.accounts.find(a => a.id === id);
    if (!acc) return;
    Object.assign(acc, patch);
    PF.store.touch();
  },

  remove(id) {
    const data = PF.store.data;
    const inUse = data.transactions.some(t => t.accountId === id || t.fromAccountId === id || t.toAccountId === id);
    if (inUse) throw new Error("לא ניתן למחוק חשבון עם תנועות קיימות");
    data.accounts = data.accounts.filter(a => a.id !== id);
    PF.store.touch();
  },

  // (Loan balance reconciliation lives in PF.loans.adjustTo — a loan isn't an
  // account, so it isn't handled here.)

  // Reconcile a manual balance reading to `targetBalance` by inserting an adjustment
  // transaction for the delta (Quicken/YNAB-style reconciliation).
  adjustBalanceTo(accountId, targetBalance, date) {
    const acc = PF.store.data.accounts.find(a => a.id === accountId);
    const current = PF.accounts.balance(accountId);
    const delta = Math.round((targetBalance - current) * 100) / 100;
    if (delta === 0) return null;
    // On the shared account, an adjustment isn't "cash I forgot about" like on
    // your own accounts - everything you moved in is already a logged
    // transfer, so any gap is your partner's own contributions and/or joint
    // spending neither of you has itemized here yet.
    const notes = acc && acc.type === "shared_bank"
      ? `התאמה בחשבון המשותף מ-${current} ל-${targetBalance} - כנראה כספים מבן/בת הזוג ו/או הוצאות משותפות שטרם נרשמו`
      : `עודכן מ-${current} ל-${targetBalance}`;
    const txn = {
      id: PF.uid(),
      date: date || PF.todayStr(),
      amount: Math.abs(delta),
      type: delta > 0 ? "income" : "expense",
      accountId,
      categoryId: null,
      isAdjustment: true,
      payee: "התאמת יתרה",
      notes,
      source: "manual"
    };
    PF.store.data.transactions.push(txn);
    PF.store.touch();
    return txn;
  }
};
