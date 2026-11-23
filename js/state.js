// Global namespace + in-memory state with a tiny pub/sub so views re-render on change.
window.PF = window.PF || {};

PF.SCHEMA_VERSION = 1;

PF.DEFAULT_EXPENSE_CATEGORIES = [
  "מזון ומשקאות", "אנרגיה", "ביטוח ופיננסים", "חינוך", "פנאי בילוי",
  "מסעדות", "רפואה ובריאות", "ריהוט ובית", "תחבורה", "הלוואה", "שונות"
];

PF.DEFAULT_INCOME_CATEGORIES = ["מלגה", "שיעורים פרטיים", "עבודה באוניברסיטה"];

PF.ACCOUNT_TYPES = {
  bank: "חשבון בנק",
  shared_bank: "חשבון בנק משותף",
  cash: "מזומן",
  bit: "Bit",
  investment: "השקעות",
  // A loan is NOT an account here — it never holds spendable money, so it
  // doesn't belong in this list. It's tracked separately (see js/loans.js)
  // as debt + a recurring expense category, not as a balance you can pick as
  // a transfer source/destination. See PF.migrate() for the one-time
  // conversion of any pre-existing "loan"-type account.
  // Not a real account with a real balance — a destination/source for a
  // transfer that leaves the accounts you actually track (money sent to or
  // received from someone else, e.g. family). Lets "transfer" cover that case
  // instead of being forced into type "expense"/"income" just because there's
  // no second tracked account for the other side.
  external: "אדם אחר (מחוץ למעקב)"
};

// Credit cards are NOT accounts with their own tracked balance — a purchase
// still debits the underlying bank account, same as always. A card is just a
// tag on an expense (which physical card it went on) so you can filter by it;
// it never changes any balance math.
PF.CARD_TYPES = {
  joint: "כרטיס משותף",
  personal: "כרטיס אישי"
};

// Income templates for quick-add (amounts per your actual sources).
PF.INCOME_TEMPLATES = [
  { category: "מלגה", amount: 7500, fixed: true },
  { category: "עבודה באוניברסיטה", amount: 3000, fixed: false },
  { category: "שיעורים פרטיים", amount: null, fixed: false }
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
PF.uid = uid;

// LOCAL calendar date (not UTC) as "YYYY-MM-DD". Deliberately not
// new Date().toISOString().slice(0,10): that reads the UTC date, which in
// any positive-UTC-offset timezone (e.g. Israel) shows YESTERDAY's date for
// a few hours after local midnight.
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
PF.todayStr = todayStr;

// Pure integer month arithmetic on a "YYYY-MM" string — deliberately NOT
// constructing a Date and reading it back via toISOString(), which converts
// through UTC: for day 1 at local midnight in any positive-UTC-offset
// timezone (e.g. Israel), that silently rolls the result back a full
// calendar month. Shared by js/simulate.js and js/accounts.js.
function addMonths(month, n) {
  const [y, m] = month.split("-").map(Number);
  const total = (m - 1) + n;
  const newY = y + Math.floor(total / 12);
  const newM = ((total % 12) + 12) % 12 + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}
PF.addMonths = addMonths;

// Every credit card in this app is assumed to bill on the 10th of the month
// AFTER the purchase (e.g. a November charge is pulled from the bank on
// December 10th) — the same assumption the Simulate view uses for its
// estimated expense/loan timing. Used to tell a "real bank balance right
// now" apart from the computed ledger balance, which deducts a card charge
// the moment it's logged rather than when it's actually billed.
PF.CARD_BILLING_DAY = 10;

function emptyData() {
  const now = todayStr();
  const expenseCats = PF.DEFAULT_EXPENSE_CATEGORIES.map(name => ({ id: uid(), name, kind: "expense" }));
  const incomeCats = PF.DEFAULT_INCOME_CATEGORIES.map(name => ({ id: uid(), name, kind: "income" }));
  return {
    schemaVersion: PF.SCHEMA_VERSION,
    accounts: [
      { id: uid(), name: "בנק - חשבון פרטי", type: "bank", openingBalance: 0, openingDate: now },
      { id: uid(), name: "בנק - חשבון משותף", type: "shared_bank", openingBalance: 0, openingDate: now },
      { id: uid(), name: "מזומן", type: "cash", openingBalance: 0, openingDate: now },
      { id: uid(), name: "Bit", type: "bit", openingBalance: 0, openingDate: now },
      { id: uid(), name: "השקעות", type: "investment", openingBalance: 0, openingDate: now }
    ],
    categories: [...incomeCats, ...expenseCats],
    cards: [
      { id: uid(), name: "כרטיס משותף", type: "joint" },
      { id: uid(), name: "כרטיס אישי", type: "personal" }
    ],
    transactions: [],
    importProfiles: [],
    payeeRules: {}, // payee text (normalized) -> categoryId, learned from manual categorization & import review
    loans: [], // { id, name, openingBalance (negative = still owed), openingDate } — see js/loans.js
    dismissedDuplicatePairs: [] // [[idA, idB], ...] — pairs the user confirmed are NOT duplicates, see js/import/dedupe.js
  };
}
PF.emptyData = emptyData;

PF.store = {
  data: null,
  _listeners: [],
  set(data) {
    PF.store.data = data;
    PF.store._notify();
  },
  onChange(fn) {
    PF.store._listeners.push(fn);
  },
  _notify() {
    PF.store._listeners.forEach(fn => fn(PF.store.data));
  },
  touch() {
    PF.store._notify();
    if (PF.persistence && PF.persistence.scheduleSave) PF.persistence.scheduleSave();
  }
};

function migrate(data) {
  data.schemaVersion = data.schemaVersion || 1;
  data.accounts = data.accounts || [];
  data.categories = data.categories || [];
  data.cards = data.cards || [];
  data.transactions = data.transactions || [];
  data.importProfiles = data.importProfiles || [];
  data.payeeRules = data.payeeRules || {};
  data.loans = data.loans || [];
  data.dismissedDuplicatePairs = data.dismissedDuplicatePairs || [];

  // Backfill installment info (installmentIndex/installmentTotal) onto any
  // already-imported transaction whose notes contain "תשלום X מתוך Y" but
  // predates this feature — PF.transactions.add()/addMany() already do this
  // for anything imported from now on, so this only ever touches old rows;
  // once backfilled, there's nothing left to do on later loads.
  data.transactions.forEach(t => {
    if (t.installmentTotal) return;
    const installment = PF.transactions.parseInstallment(t.notes);
    if (installment) { t.installmentIndex = installment.index; t.installmentTotal = installment.total; }
  });

  // One-time conversion: a loan used to be a special "loan"-type account
  // (negative balance = debt), with payments stored as transfers into it so
  // they wouldn't double-count in income/expense totals. But a loan never
  // holds spendable money, and a payment toward it IS real spending — so
  // it's now tracked as debt in `data.loans` (same openingBalance/openingDate
  // arithmetic as before, just not under `accounts`) with payments recorded
  // as plain expense transactions tagged with `loanId`. Once converted, no
  // "loan"-type account is left to find, so this is a no-op on every later
  // load.
  const loanAccounts = data.accounts.filter(a => a.type === "loan");
  if (loanAccounts.length) {
    let loanCat = data.categories.find(c => c.kind === "expense" && c.name === "הלוואה");
    if (!loanCat) {
      loanCat = { id: uid(), name: "הלוואה", kind: "expense" };
      data.categories.push(loanCat);
    }
    loanAccounts.forEach(acc => {
      data.loans.push({ id: acc.id, name: acc.name, openingBalance: acc.openingBalance || 0, openingDate: acc.openingDate });
      data.transactions.forEach(t => {
        if (t.type === "transfer" && t.toAccountId === acc.id) {
          t.type = "expense";
          t.accountId = t.fromAccountId;
          t.categoryId = loanCat.id;
          t.loanId = acc.id;
          delete t.fromAccountId;
          delete t.toAccountId;
        }
      });
    });
    data.accounts = data.accounts.filter(a => a.type !== "loan");
  }

  return data;
}
PF.migrate = migrate;
