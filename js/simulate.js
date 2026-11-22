window.PF = window.PF || {};

// "What if" simulation. Nothing here touches real data — it's a pure scratch
// calculation over your current balances plus hypothetical items the user
// builds in the Simulate view (expected income, estimated expenses, expected
// loan payment, one-off moves like "transfer 3000 to the shared account").
PF.simulate = (function () {

  // LOCAL calendar month (not UTC — the user's own "this month", matching
  // their wall clock) as "YYYY-MM".
  function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function nextMonth() {
    return addMonths(currentMonth(), 1);
  }

  // Pure integer month arithmetic — deliberately NOT constructing a Date and
  // reading it back via toISOString(), which converts through UTC: for day 1
  // at local midnight in any positive-UTC-offset timezone (e.g. Israel),
  // that silently rolls the result back a full calendar month.
  function addMonths(month, n) {
    const [y, m] = month.split("-").map(Number);
    const total = (m - 1) + n;
    const newY = y + Math.floor(total / 12);
    const newM = ((total % 12) + 12) % 12 + 1;
    return `${newY}-${String(newM).padStart(2, "0")}`;
  }

  // Whole calendar months between two "YYYY-MM" strings (b - a). Used to
  // check whether a recurring item with a limited duration is still active.
  function monthDiff(a, b) {
    const [ay, am] = a.split("-").map(Number);
    const [by, bm] = b.split("-").map(Number);
    return (by - ay) * 12 + (bm - am);
  }

  // Does scenario item `it` apply in month `m`? A one-time item applies only
  // in its own month. A recurring item applies from its start month onward —
  // forever if `durationMonths` is falsy, otherwise only for that many
  // consecutive months (1 = just the start month, same as one-time).
  function itemAppliesInMonth(it, m) {
    if (!it.recurring) return m === it.month;
    const diff = monthDiff(it.month, m);
    return diff >= 0 && (!it.durationMonths || diff < it.durationMonths);
  }

  // "YYYY-MM" + a day-of-month -> "YYYY-MM-DD", clamped to 28 so a day like
  // 31 never produces an invalid date in a short month — fine here since this
  // is only ever used for chart/axis labeling, not real calendar math.
  function dateForDay(month, day) {
    return `${month}-${String(Math.min(28, Math.max(1, day))).padStart(2, "0")}`;
  }

  function monthLabel(month) {
    const names = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
    const [y, m] = month.split("-").map(Number);
    return `${names[m - 1]} ${y}`;
  }

  // The `count` consecutive months starting at `startMonth`.
  function horizonMonths(startMonth, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(addMonths(startMonth, i));
    return out;
  }

  // The `count` full calendar months immediately before `beforeMonth`
  // (YYYY-MM), oldest first.
  function monthsBefore(beforeMonth, count) {
    const months = [];
    for (let i = count; i >= 1; i--) months.push(addMonths(beforeMonth, -i));
    return months;
  }

  // Average monthly spend per expense category over the `count` full months
  // right before `beforeMonth` — excluding balance adjustments. A sensible
  // starting estimate for "what will I likely spend".
  function averageExpenseByCategory(beforeMonth, count) {
    count = count || 3;
    const months = monthsBefore(beforeMonth, count);
    const totals = {}; // categoryId|null -> total
    for (const t of PF.store.data.transactions) {
      if (t.type !== "expense" || t.isAdjustment) continue;
      if (!months.includes(t.date.slice(0, 7))) continue;
      const key = t.categoryId || "__uncategorized__";
      totals[key] = (totals[key] || 0) + t.amount;
    }
    return Object.entries(totals).map(([key, sum]) => ({
      categoryId: key === "__uncategorized__" ? null : key,
      name: key === "__uncategorized__" ? "לא מסווג" : (PF.categories.byId(key) || {}).name || "?",
      avgAmount: Math.round((sum / count) * 100) / 100
    })).filter(r => r.avgAmount > 0).sort((a, b) => b.avgAmount - a.avgAmount);
  }

  // Toll-road payments (Highway 6 / כביש חוצה ישראל, billed via "דרך ארץ")
  // get split out of the general תחבורה average — grouped with fuel as one
  // "driving cost" bucket in the user's own mental model — from the rest of
  // that category (public transit, taxis, parking, car service).
  const HIGHWAY6_RE = /כביש.{0,4}6|חוצה ישראל|דרך ארץ/;
  function isHighway6Payment(t) {
    return HIGHWAY6_RE.test(t.payee || "");
  }

  // Average monthly amount for expenses matching `predicate`, over the
  // `count` full months right before `beforeMonth` — same window/exclusions
  // as averageExpenseByCategory, but filtered at the transaction level
  // instead of grouped by category, so a single category can be split into
  // more than one simulation line.
  function averageAmountFor(beforeMonth, count, predicate) {
    count = count || 3;
    const months = monthsBefore(beforeMonth, count);
    let sum = 0;
    for (const t of PF.store.data.transactions) {
      if (t.type !== "expense" || t.isAdjustment) continue;
      if (!months.includes(t.date.slice(0, 7))) continue;
      if (!predicate(t)) continue;
      sum += t.amount;
    }
    return Math.round((sum / count) * 100) / 100;
  }

  // Average payment actually made toward a loan (expenses tagged with its
  // loanId) over the `count` full months right before `beforeMonth`. Falls
  // back to the most recent single payment if there's too little history to
  // average.
  function averageLoanPayment(loanId, beforeMonth, count) {
    count = count || 3;
    const months = monthsBefore(beforeMonth, count);
    const payments = PF.store.data.transactions.filter(t =>
      t.type === "expense" && t.loanId === loanId && months.includes(t.date.slice(0, 7))
    );
    if (payments.length) {
      const sum = payments.reduce((s, t) => s + t.amount, 0);
      return Math.round((sum / count) * 100) / 100;
    }
    const last = PF.store.data.transactions
      .filter(t => t.type === "expense" && t.loanId === loanId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return last ? last.amount : 0;
  }

  function currentBalances() {
    const map = {};
    for (const acc of PF.store.data.accounts) map[acc.id] = PF.accounts.balance(acc.id);
    return map;
  }

  // Which day of the month an item lands on — used only to order events
  // WITHIN a simulated month (so a card charge on the 10th can be checked
  // against whether the scholarship's 2nd installment, also the 10th, has
  // landed yet), never to decide whether the item applies that month at all.
  function itemDay(it) {
    return it.day || 1;
  }

  function applyItem(balances, it) {
    if (it.type === "income") balances[it.accountId] = (balances[it.accountId] || 0) + it.amount;
    else if (it.type === "expense") balances[it.accountId] = (balances[it.accountId] || 0) - it.amount;
    else if (it.type === "transfer") {
      balances[it.fromAccountId] = (balances[it.fromAccountId] || 0) - it.amount;
      balances[it.toAccountId] = (balances[it.toAccountId] || 0) + it.amount;
    }
  }

  // Items: [{ type, amount, accountId|fromAccountId/toAccountId, included,
  //           month: 'YYYY-MM' (when it first applies), recurring: bool,
  //           day: 1-31 (when during the month it lands) }]
  // Walks `count` consecutive months starting at `startMonth`, carrying
  // balances forward. Within each month, items are applied in DAY order (not
  // all dumped at month-end) — a card charge on the 10th can only draw down
  // what's actually landed by the 10th, not income still a week away. This
  // is what makes a mid-month dip visible even when the month closes fine.
  // Returns one end-of-month snapshot per month, the lowest point the
  // headline liquid total touched during each month (+ which day), and the
  // first month/day (if any) a non-excluded account actually went negative.
  // `includeAccountIds` controls which accounts feed the headline "liquid"
  // figure (the chart/banner/dip column) — defaults to every non-excluded
  // account (the old behavior), but the Simulate view lets the user narrow
  // it down (e.g. "just the bank account") without changing which account
  // each item actually debits/credits.
  function projectTimeline(items, startMonth, count, includeAccountIds) {
    const months = horizonMonths(startMonth, count);
    let balances = currentBalances();
    const timeline = [];
    const monthMinLiquid = [];
    let firstProblem = null;
    const liquidAccountIds = includeAccountIds || PF.store.data.accounts
      .filter(a => !PF.accounts.EXCLUDED_FROM_TOTAL.includes(a.type)).map(a => a.id);
    const liquidNow = () => Math.round(liquidAccountIds.reduce((s, id) => s + (balances[id] || 0), 0) * 100) / 100;
    // One point per day something actually happens (not every single
    // calendar day) — enough to see exactly when money lands and leaves,
    // without a chart that's mostly flat lines between events.
    const dailyTrace = [{ date: PF.todayStr(), value: liquidNow() }];
    // An "external" account is just a tally of money sent to someone outside
    // your tracked accounts — it's expected to run negative, not a sign you
    // actually have a problem, so it doesn't count toward "is this a
    // problem" (a loan isn't an account at all anymore, so there's nothing
    // to exclude for it here — see PF.loans).
    const NOT_A_REAL_PROBLEM = ["external"];
    const checkNegative = (m, day) => {
      if (firstProblem) return;
      const negAcc = PF.store.data.accounts.find(a => !NOT_A_REAL_PROBLEM.includes(a.type) && Math.round((balances[a.id] || 0) * 100) / 100 < 0);
      if (negAcc) firstProblem = { month: m, day, account: negAcc, balance: Math.round((balances[negAcc.id] || 0) * 100) / 100 };
    };
    for (const m of months) {
      const monthItems = items
        .filter(it => it.included && it.amount && itemAppliesInMonth(it, m))
        .map(it => ({ it, day: itemDay(it) }))
        .sort((a, b) => a.day - b.day);
      let minLiquid = { value: liquidNow(), day: 0 }; // carried-in balance counts too
      checkNegative(m, 0);
      for (const { it, day } of monthItems) {
        applyItem(balances, it);
        const liquidVal = liquidNow();
        if (liquidVal < minLiquid.value) minLiquid = { value: liquidVal, day };
        checkNegative(m, day);
        dailyTrace.push({ date: dateForDay(m, day), value: liquidVal });
      }
      for (const id in balances) balances[id] = Math.round(balances[id] * 100) / 100;
      timeline.push({ month: m, balances: { ...balances } });
      monthMinLiquid.push(minLiquid);
    }
    return { months, timeline, firstProblem, monthMinLiquid, dailyTrace };
  }

  // The scenario (seeded defaults + whatever the user added/edited) lives here,
  // on the module, NOT inside the Simulate view function. A view function runs
  // fresh every time its route renders — including just re-clicking its own
  // nav button — so keeping `items` as a local variable there silently wiped
  // out anything the user had added. Keeping it here survives re-renders and
  // tab switches. It's ALSO mirrored to localStorage (browser-only, per
  // viewer — deliberately never written into the real data file/JSON, since
  // this is a scratch "what if" plan, not real financial data) so it survives
  // a full page reload too, until the user explicitly resets it.
  // Bumped to v2 when day-of-month timing (scholarship split, salary/expense/
  // loan due-days) was added — a scenario persisted under v1 has no `day`
  // fields, which would silently default every item to day 1 and hide the
  // whole point of simulating mid-month timing. Bumping the key makes any
  // old persisted scenario get ignored and reseeded fresh instead.
  const STORAGE_KEY = "pf_simulation_scenario_v2";
  // includeAccountIds: null means "every non-excluded account" (the default,
  // old behavior); once the user picks specific accounts in the Simulate
  // view, it becomes an explicit array and narrows the headline total.
  const scenario = { items: [], nextId: 1, initialized: false, targetMonth: nextMonth(), horizon: 3, includeAccountIds: null };

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario)); } catch (e) { /* private browsing etc. — just skip persisting */ }
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.items)) return false;
      Object.assign(scenario, saved);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Builds the auto-estimated items (income templates, average expenses,
  // average loan payment) for whatever month is currently selected. They're
  // all `recurring: true` starting at targetMonth — i.e. assumed to repeat
  // every month of the simulated horizon, same as real life.
  function seedEstimates(bankAcc) {
    PF.INCOME_TEMPLATES.forEach(tpl => {
      const cat = PF.categories.findByName(tpl.category, "income");
      // מלגה arrives in two real, separately-dated installments, not one
      // lump sum — splitting it is what lets the simulation show the gap
      // before the 10th (when the bigger half lands) rather than pretending
      // the whole ₪7,500 is there from day 1.
      if (tpl.category === "מלגה" && tpl.amount != null) {
        scenario.items.push({
          id: scenario.nextId++, kind: "income", type: "income",
          label: "מלגה (חלק א')", amount: 3000,
          accountId: bankAcc.id, categoryId: cat ? cat.id : null,
          included: true, recurring: true, month: scenario.targetMonth, day: 1
        });
        scenario.items.push({
          id: scenario.nextId++, kind: "income", type: "income",
          label: "מלגה (חלק ב')", amount: 4500,
          accountId: bankAcc.id, categoryId: cat ? cat.id : null,
          included: true, recurring: true, month: scenario.targetMonth, day: 10
        });
        return;
      }
      // Salary lands on the 1st; tutoring trickles in through the month with
      // no fixed date, so day 20 is a mid-to-late placeholder — it's an
      // estimate either way, never treat it as available early.
      const isTutoring = tpl.category === "שיעורים פרטיים";
      const day = tpl.category === "עבודה באוניברסיטה" ? 1 : isTutoring ? 20 : 1;
      // תutoring has no fixed real-life amount, so there's nothing to seed it
      // with — but leaving it at 0/unchecked meant it silently dropped out of
      // every forecast unless re-entered by hand each time the month changed.
      // ₪1,000 is just a starting placeholder; edit the amount per-row like
      // any other estimate.
      const amount = tpl.amount != null ? tpl.amount : (isTutoring ? 1000 : 0);
      scenario.items.push({
        id: scenario.nextId++, kind: "income", type: "income",
        label: tpl.category, amount,
        accountId: bankAcc.id, categoryId: cat ? cat.id : null,
        included: tpl.amount != null || isTutoring, recurring: true, month: scenario.targetMonth, day
      });
    });
    // Everyday spending mostly runs through the credit cards, which bill as
    // one lump sum on the 10th — not spread evenly through the month — so
    // that's the day the money actually leaves the bank for this estimate.
    // תחבורה is split into "כביש 6" (grouped with fuel as driving cost in the
    // user's own mental model) vs. the rest of that category (public
    // transit, taxis, parking, car service), instead of one blended average.
    const transportCat = PF.categories.findByName("תחבורה", "expense");
    averageExpenseByCategory(scenario.targetMonth, 3).forEach(c => {
      if (transportCat && c.categoryId === transportCat.id) return;
      scenario.items.push({
        id: scenario.nextId++, kind: "expense", type: "expense",
        label: c.name, amount: c.avgAmount,
        accountId: bankAcc.id, categoryId: c.categoryId,
        included: true, recurring: true, month: scenario.targetMonth, day: 10
      });
    });
    if (transportCat) {
      const highway6Avg = averageAmountFor(scenario.targetMonth, 3,
        t => t.categoryId === transportCat.id && isHighway6Payment(t));
      const restAvg = averageAmountFor(scenario.targetMonth, 3,
        t => t.categoryId === transportCat.id && !isHighway6Payment(t));
      if (highway6Avg > 0) {
        scenario.items.push({
          id: scenario.nextId++, kind: "expense", type: "expense",
          label: "כביש 6 / חוצה ישראל", amount: highway6Avg,
          accountId: bankAcc.id, categoryId: transportCat.id,
          included: true, recurring: true, month: scenario.targetMonth, day: 10
        });
      }
      if (restAvg > 0) {
        scenario.items.push({
          id: scenario.nextId++, kind: "expense", type: "expense",
          label: "תחבורה - שאר (תח\"צ, מוניות, חניה, טיפולים)", amount: restAvg,
          accountId: bankAcc.id, categoryId: transportCat.id,
          included: true, recurring: true, month: scenario.targetMonth, day: 10
        });
      }
    }
    // A loan payment is a real expense (not a transfer to an account — a
    // loan isn't one, see PF.loans), so it's simulated the same way: money
    // leaves the bank, tagged with the loan category + which loan it's for.
    const loanCat = PF.categories.findByName("הלוואה", "expense");
    PF.loans.all().forEach(loan => {
      const avgPayment = averageLoanPayment(loan.id, scenario.targetMonth, 3);
      if (!avgPayment) return;
      scenario.items.push({
        id: scenario.nextId++, kind: "loan", type: "expense",
        label: `תשלום צפוי: ${loan.name}`, amount: avgPayment,
        accountId: bankAcc.id, categoryId: loanCat ? loanCat.id : null, loanId: loan.id,
        included: true, recurring: true, month: scenario.targetMonth, day: 10
      });
    });
  }

  function ensureInitialized(bankAcc) {
    if (scenario.initialized) return;
    if (loadPersisted()) { scenario.initialized = true; return; }
    seedEstimates(bankAcc);
    scenario.initialized = true;
    persist();
  }

  // Re-generates ONLY the auto-estimated items (income/expense/loan) for the
  // currently selected target month — e.g. after the user changes the month.
  // Custom one-off items the user typed in are left untouched.
  function reseedEstimates(bankAcc) {
    scenario.items = scenario.items.filter(it => it.kind === "custom");
    seedEstimates(bankAcc);
  }

  function setTargetMonth(bankAcc, month) {
    scenario.targetMonth = month;
    reseedEstimates(bankAcc);
    persist();
  }

  function resetScenario() {
    scenario.items = [];
    scenario.nextId = 1;
    scenario.initialized = false;
    scenario.targetMonth = nextMonth();
    scenario.horizon = 3;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function addCustomItem(item) {
    scenario.items.push({
      id: scenario.nextId++, kind: "custom", included: true,
      recurring: false, month: scenario.targetMonth, day: 1,
      ...item
    });
    persist();
  }

  function removeItem(it) {
    const idx = scenario.items.indexOf(it);
    if (idx >= 0) scenario.items.splice(idx, 1);
    persist();
  }

  return {
    currentMonth, nextMonth, addMonths, monthLabel, horizonMonths, monthDiff, itemAppliesInMonth, itemDay,
    averageExpenseByCategory, averageLoanPayment,
    currentBalances, projectTimeline, scenario, ensureInitialized, reseedEstimates,
    setTargetMonth, resetScenario, addCustomItem, removeItem, persist
  };
})();
