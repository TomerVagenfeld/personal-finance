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

  // balance() deducts a card purchase the moment it's logged — the
  // deliberate "ledger" approach real budgeting tools use, so you can't
  // accidentally re-spend money you've already committed before the real
  // bill clears. But that means it DOESN'T match what your bank's own
  // website shows today, since the card issuer hasn't actually pulled that
  // money yet.
  //
  // Verified directly against a real bank statement export: the right
  // cutoff isn't a fixed billing day, and it isn't "any non-card-tagged
  // expense" either (too easily thrown off by an ordinary cash purchase
  // that happens to lack a cardId) — it's the most recent transaction on
  // this account that's independently known to be real: income, a transfer,
  // or an explicit balance adjustment (a reconciliation to a confirmed
  // figure). Everything card-tagged dated AFTER that point was logged ahead
  // of its actual bank settlement, so it's still pending. This reproduced
  // the real bank balance to the cent on the one case it was checked
  // against — see the account's own ledger-as-of-that-date, which landed on
  // the exact figure the bank's statement showed for that day.
  pendingCardCharges(accountId) {
    const data = PF.store.data;
    const confirmedEvents = data.transactions.filter(t =>
      (t.accountId === accountId && (t.type === "income" || (t.type === "expense" && t.isAdjustment))) ||
      (t.type === "transfer" && (t.fromAccountId === accountId || t.toAccountId === accountId))
    );
    const cutoff = confirmedEvents.reduce((max, t) => (t.date > max ? t.date : max), "0000-00-00");
    const total = data.transactions
      .filter(t => t.type === "expense" && t.accountId === accountId && t.cardId && t.date > cutoff)
      .reduce((sum, t) => sum + t.amount, 0);
    return Math.round(total * 100) / 100;
  },

  // "What would my bank's own website show me right now" — balance() plus
  // whatever card spending hasn't actually left the account yet (per the
  // manually reconciled figure).
  realCurrentBalance(accountId) {
    return Math.round((PF.accounts.balance(accountId) + PF.accounts.pendingCardCharges(accountId)) * 100) / 100;
  },

  // The TOTAL open credit-card commitment across every card ever used on this
  // account — a different question from pendingCardCharges() above. That one
  // only answers "what's changed since my last balance check-in"; this one is
  // "how much will get pulled from the bank in one lump sum on the next
  // billing day," straight from each card's own current-cycle statement
  // (card.pendingAmount/pendingAsOf, set on import — see
  // PF.cards.update()/js/ui/view-import.js). Real, declared data from the
  // card issuer, not something inferred from transaction dates — those two
  // numbers can legitimately differ by a lot (a reconciliation can fold in
  // commitment that predates it), which is exactly why both are shown rather
  // than picked as "the" right one.
  upcomingCardBill(accountId) {
    const data = PF.store.data;
    const cardIds = new Set(data.transactions.filter(t => t.accountId === accountId && t.cardId).map(t => t.cardId));
    const cards = data.cards.filter(c => cardIds.has(c.id) && c.pendingAmount);
    if (!cards.length) return null;
    const total = Math.round(cards.reduce((s, c) => s + c.pendingAmount, 0) * 100) / 100;
    const asOf = cards.reduce((max, c) => (c.pendingAsOf && c.pendingAsOf > max ? c.pendingAsOf : max), "0000-00-00");
    return { total, asOf, cards: cards.map(c => ({ name: c.name, amount: c.pendingAmount })) };
  },

  // Cosmetic label only ("your next card bill is around DD/MM") — never used
  // in any balance math, see PF.CARD_BILLING_DAY's own note for why.
  nextCardBillingDate() {
    const today = PF.todayStr();
    const [y, m, d] = today.split("-").map(Number);
    const month = d < PF.CARD_BILLING_DAY ? `${y}-${String(m).padStart(2, "0")}` : PF.addMonths(`${y}-${String(m).padStart(2, "0")}`, 1);
    return `${month}-${String(PF.CARD_BILLING_DAY).padStart(2, "0")}`;
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
