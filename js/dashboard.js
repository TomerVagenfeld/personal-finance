window.PF = window.PF || {};

PF.dashboard = (function () {

  function monthKey(dateStr) {
    return dateStr.slice(0, 7); // YYYY-MM
  }

  // Pure integer month arithmetic — deliberately NOT using toISOString() on a
  // constructed Date, which converts through UTC and can silently roll the
  // result back a full month for anyone in a positive-UTC-offset timezone
  // (e.g. Israel), especially in early local-morning hours.
  function lastMonths(n) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1; // current LOCAL month, 1-indexed
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const total = (m - 1) - i;
      const yy = y + Math.floor(total / 12);
      const mm = ((total % 12) + 12) % 12 + 1;
      out.push(`${yy}-${String(mm).padStart(2, "0")}`);
    }
    return out;
  }

  // Income/expense/transfer totals by month. Transfers are kept separate from
  // income/expense (they don't change net worth overall, and lumping them in
  // would double-count money moving between your own tracked accounts) but
  // are still totaled per month so they can be shown on their own, e.g. for
  // spotting a large move to a shared account or to someone outside the app.
  function monthlyTotals(months) {
    const txns = PF.store.data.transactions;
    const map = {};
    months.forEach(m => (map[m] = { income: 0, expense: 0, transfer: 0 }));
    for (const t of txns) {
      const m = monthKey(t.date);
      if (!(m in map)) continue;
      if (t.type === "transfer") map[m].transfer += t.amount;
      else if (t.type === "income") map[m].income += t.amount;
      else map[m].expense += t.amount;
    }
    return map;
  }

  // Category breakdown within a date range, for a given kind (income|expense).
  function categoryBreakdown(from, to, kind) {
    const txns = PF.transactions.filter({ from, to, type: kind });
    const byCategory = {};
    for (const t of txns) {
      const cat = t.categoryId ? PF.categories.byId(t.categoryId) : null;
      const label = t.isAdjustment ? "התאמת יתרה" : (cat ? cat.name : "לא מסווג");
      byCategory[label] = (byCategory[label] || 0) + t.amount;
    }
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  }

  // Loan payments specifically (expenses tagged with a loanId) — these are
  // ALREADY counted in the income/expense totals above (a loan payment is
  // real spending, not a transfer), this just singles them out so the user
  // can see what they're paying toward the loan specifically.
  function loanPayments(from, to) {
    if (!PF.store.data.loans.length) return [];
    return PF.transactions.filter({ from, to, type: "expense" }).filter(t => !!t.loanId);
  }

  const charts = {};
  function renderOrUpdate(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    // Views rebuild their container (innerHTML = "") on every re-render, which
    // destroys and recreates the <canvas> element even though it keeps the
    // same id. A cached Chart instance from before still points at the OLD,
    // now-detached canvas, so update()-ing it draws nothing visible. Detect
    // that the live canvas isn't the one this chart is attached to, and
    // start fresh instead of silently updating a chart nobody can see.
    if (charts[canvasId] && charts[canvasId].canvas !== ctx) {
      charts[canvasId].destroy();
      delete charts[canvasId];
    }
    if (charts[canvasId]) {
      charts[canvasId].data = config.data;
      charts[canvasId].options = config.options;
      charts[canvasId].update();
      return charts[canvasId];
    }
    charts[canvasId] = new Chart(ctx, config);
    return charts[canvasId];
  }

  return { monthKey, lastMonths, monthlyTotals, categoryBreakdown, loanPayments, renderOrUpdate };
})();
