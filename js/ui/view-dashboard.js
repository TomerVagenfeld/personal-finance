window.PF = window.PF || {};
PF.views = PF.views || {};

PF.views.dashboard = function (root) {
  const { h, money } = PF.ui;
  const data = PF.store.data;

  if (!data.accounts.length) {
    root.appendChild(h("div", { class: "card" }, [h("p", { class: "empty-state" }, ["אין עדיין חשבונות. עברו ל\"חשבונות\" כדי להוסיף."])]));
    return;
  }

  // --- Total balance + per-account balances --------------------------------
  // "יתרה כוללת" is money you count as yours — personal bank, cash, Bit,
  // investments. Loan debt (not an account — see PF.loans) and the shared
  // account (not solely yours) are each tracked on their own instead,
  // deliberately kept OUT of this headline number by design — see
  // PF.accounts.balance()/PF.loans.totalRemaining()/PF.accounts.sharedTotal().
  // A loan payment still lowers this total, same as any other expense.
  //
  // Deliberately just the plain ledger number, kept accurate by manual
  // reconciliation (see view-accounts.js) rather than any automatic
  // "pending card charges" estimate — that was tried and repeatedly produced
  // wrong numbers once spending got untidy.
  const loanTotal = PF.loans.totalRemaining();
  const sharedTotal = PF.accounts.sharedTotal();
  const statsGrid = h("div", { class: "grid cols-2 kpi-grid" });

  const KPI_ICONS = {
    total: '<path d="M3 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M15 12h3"/><path d="M3 7l2-3h10l2 3"/>',
    loan: '<path d="M4 10h16"/><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><rect x="4" y="10" width="16" height="8" rx="2"/>',
    shared: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5"/><path d="M13.5 15.2c2 .3 3.5 2 3.5 4.3"/>',
    cash: '<rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.6"/>',
    bit: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    cardbill: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>'
  };
  function kpiIconSvg(name) {
    return `<svg class="kpi-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${KPI_ICONS[name] || ""}</svg>`;
  }

  // "יתרה כוללת" with its own components listed right underneath — except
  // cash and Bit, which already get their own tiles below, so listing them
  // here too would just repeat the same numbers twice.
  const liquidAccounts = data.accounts.filter(a => !PF.accounts.EXCLUDED_FROM_TOTAL.includes(a.type));
  const totalBreakdown = liquidAccounts.filter(a => a.type !== "cash" && a.type !== "bit");
  const liquidTotal = PF.accounts.liquidTotal();
  statsGrid.appendChild(kpiTile("total", "יתרה כוללת", liquidTotal,
    totalBreakdown.length ? totalBreakdown.map(a => [a.name, PF.accounts.balance(a.id)]) : null));

  // The OTHER forward-looking number, distinct from both figures in the tile
  // above: the full open credit-card commitment across every card, straight
  // from each card's own current-cycle statement (not inferred from
  // transaction dates) — see PF.accounts.upcomingCardBill(). Only shown once
  // at least one card has that data (i.e. after a current-cycle statement's
  // been imported at least once).
  const cardBillsByAccount = liquidAccounts.map(a => ({ account: a, bill: PF.accounts.upcomingCardBill(a.id) })).filter(x => x.bill);
  if (cardBillsByAccount.length) {
    const grandTotal = Math.round(cardBillsByAccount.reduce((s, x) => s + x.bill.total, 0) * 100) / 100;
    const allCardRows = cardBillsByAccount.flatMap(x => x.bill.cards);
    const billingDate = PF.accounts.nextCardBillingDate();
    const billingDay = Number(billingDate.slice(8, 10));
    const billingMonthName = PF.simulate.monthLabel(billingDate.slice(0, 7)).split(" ")[0];
    statsGrid.appendChild(h("div", { class: "kpi-tile" }, [
      h("div", { class: "kpi-icon kpi-icon-cardbill", html: kpiIconSvg("cardbill") }),
      h("div", { class: "kpi-body" }, [
        h("span", { class: "label" }, [`חיוב קרוב בכרטיסים (${billingDay} ב${billingMonthName})`]),
        h("span", { class: "value negative" }, [money(grandTotal)]),
        h("div", { class: "kpi-breakdown" }, allCardRows.map(c => h("div", { class: "kpi-breakdown-row" }, [h("span", {}, [c.name]), h("b", {}, [money(c.amount)])])))
      ])
    ]));
  }

  // Loan debt, broken down the same way if there's more than one loan.
  const loans = PF.loans.all();
  if (loans.length) {
    statsGrid.appendChild(kpiTile("loan", "סך חוב בהלוואות", -loanTotal,
      loans.length > 1 ? loans.map(l => [l.name, PF.loans.remaining(l.id)]) : null));
  }

  // Cash isn't part of any of the groupings above but still deserves its own
  // quick-glance tile (it's already visible in the total's breakdown, this is
  // just for at-a-glance balance without doing the math).
  const cashAcc = data.accounts.find(a => a.type === "cash");
  if (cashAcc) statsGrid.appendChild(kpiTile("cash", cashAcc.name, PF.accounts.balance(cashAcc.id)));

  // The shared account's total and how much of it is YOUR OWN transfers in —
  // one tile, two figures side by side, instead of two separate tiles.
  if (data.accounts.some(a => a.type === "shared_bank")) {
    const sharedAcc = data.accounts.find(a => a.type === "shared_bank");
    statsGrid.appendChild(h("div", { class: "kpi-tile kpi-tile-wide" }, [
      h("div", { class: "kpi-icon kpi-icon-shared", html: kpiIconSvg("shared") }),
      h("div", { class: "kpi-body" }, [
        h("span", { class: "label" }, ["חשבון משותף"]),
        h("div", { class: "kpi-pair" }, [
          h("div", {}, [h("span", { class: "kpi-sublabel" }, ["יתרה כוללת"]), h("span", { class: "value" }, [money(sharedTotal)])]),
          h("div", {}, [h("span", { class: "kpi-sublabel" }, ["מזה, הועברתי על ידי"]), h("span", { class: "value" }, [money(PF.accounts.transfersIn(sharedAcc.id))])])
        ])
      ])
    ]));
  }

  const bitAcc = data.accounts.find(a => a.type === "bit");
  if (bitAcc) statsGrid.appendChild(kpiTile("bit", bitAcc.name, PF.accounts.balance(bitAcc.id)));

  root.appendChild(h("div", { class: "card" }, [h("h2", {}, ["סקירה כללית"]), statsGrid]));

  function kpiTile(iconName, label, value, breakdown) {
    return h("div", { class: "kpi-tile" }, [
      h("div", { class: `kpi-icon kpi-icon-${iconName}`, html: kpiIconSvg(iconName) }),
      h("div", { class: "kpi-body" }, [
        h("span", { class: "label" }, [label]),
        h("span", { class: "value " + (value >= 0 ? "positive" : "negative") }, [money(value)]),
        breakdown ? h("div", { class: "kpi-breakdown" },
          breakdown.map(([name, val]) => h("div", { class: "kpi-breakdown-row" }, [h("span", {}, [name]), h("b", {}, [money(val)])]))
        ) : null
      ])
    ]);
  }

  function statCard(label, value, big, sub, breakdown) {
    return h("div", { class: "stat" }, [
      h("span", { class: "label" }, [label + (sub ? ` · ${sub}` : "")]),
      h("span", { class: "value " + (value >= 0 ? "positive" : "negative"), style: big ? "font-size:28px" : "" }, [money(value)]),
      breakdown ? h("div", { style: "margin-top:2px; display:flex; flex-direction:column; gap:2px" },
        breakdown.map(([name, val]) => h("span", { style: "font-size:12px; color:var(--muted)" }, [`${name}: ${money(val)}`]))
      ) : null
    ]);
  }

  // --- Quick-add income templates ------------------------------------------
  const quickCard = h("div", { class: "card" });
  quickCard.appendChild(h("h3", {}, ["הוספת הכנסה מהירה"]));
  PF.INCOME_TEMPLATES.forEach(tpl => {
    const amountInput = h("input", { type: "number", step: "0.01", value: tpl.amount != null ? tpl.amount : "", style: "width:110px", placeholder: tpl.amount == null ? "סכום החודש" : "" });
    const row = h("div", { class: "income-template-row" }, [
      h("span", {}, [tpl.category + (tpl.fixed ? " (קבוע)" : tpl.amount != null ? " (בקירוב)" : " (משתנה)")]),
      h("div", { class: "row", style: "flex:0 0 auto; align-items:center; gap:8px" }, [
        amountInput,
        h("button", { class: "small primary", onclick: () => addQuickIncome(tpl.category, amountInput) }, ["הוסף"])
      ])
    ]);
    quickCard.appendChild(row);
  });
  root.appendChild(quickCard);

  function addQuickIncome(categoryName, amountInput) {
    const amount = Number(amountInput.value);
    if (!amount) { PF.ui.toast("יש להזין סכום"); return; }
    const cat = PF.categories.findByName(categoryName, "income") || PF.categories.add(categoryName, "income");
    const defaultAccount = data.accounts.find(a => a.type === "bank") || data.accounts[0];
    PF.transactions.add({
      date: PF.ui.todayStr(), amount, type: "income",
      accountId: defaultAccount.id, categoryId: cat.id, payee: categoryName
    });
    PF.ui.toast(`נוספה הכנסה: ${categoryName} · ${money(amount)}`);
    PF.app.render();
  }

  // --- Monthly income vs expense (last 6 months) ---------------------------
  const months = PF.dashboard.lastMonths(6);
  const totals = PF.dashboard.monthlyTotals(months);
  const chartsGrid = h("div", { class: "grid cols-2" });

  const monthlyCard = h("div", { class: "card" }, [
    h("h3", {}, ["הכנסות, הוצאות והעברות - 6 חודשים אחרונים"]),
    h("div", { class: "chart-wrap" }, [h("canvas", { id: "chart-monthly" })])
  ]);
  chartsGrid.appendChild(monthlyCard);

  root.appendChild(chartsGrid);

  // --- Flexible group-by chart: pick a dimension + a measure, with the same
  // filters as the Transactions page. Covers things like "how much did I
  // spend per credit card", "spending trend by month", or "which categories
  // cost the most" — all the same tool, just a different grouping/measure.
  root.appendChild(groupByCard());

  // --- Loan summary, if a loan exists ---------------------------------------
  if (loans.length) {
    const nowMonth = months[months.length - 1];
    const monthFrom = nowMonth + "-01";
    const monthTo = nowMonth + "-31";
    const loanPaymentsThisMonth = PF.dashboard.loanPayments(monthFrom, monthTo);
    const totalPaidThisMonth = loanPaymentsThisMonth.reduce((s, t) => s + t.amount, 0);
    const grid = h("div", { class: "grid cols-3" });
    loans.forEach(l => grid.appendChild(statCard(l.name, PF.loans.remaining(l.id), false, "יתרת הלוואה")));
    grid.appendChild(statCard(`תשלומי הלוואה - ${nowMonth}`, -totalPaidThisMonth, false));
    root.appendChild(h("div", { class: "card" }, [h("h3", {}, ["הלוואות"]), grid]));
  }

  requestAnimationFrame(() => {
    PF.dashboard.renderOrUpdate("chart-monthly", {
      type: "bar",
      data: {
        labels: months,
        datasets: [
          { label: "הכנסות", data: months.map(m => totals[m].income), backgroundColor: "#16a34a" },
          { label: "הוצאות", data: months.map(m => totals[m].expense), backgroundColor: "#dc2626" },
          { label: "העברות", data: months.map(m => totals[m].transfer), backgroundColor: "#64748b" }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  });

  if (!months.some(m => totals[m].income || totals[m].expense || totals[m].transfer)) {
    root.appendChild(h("p", { class: "empty-state" }, ["אין עדיין תנועות החודש. הוסיפו תנועה ידנית או ייבאו קובץ כדי לראות נתונים."]));
  }

  // --- The group-by card itself --------------------------------------------
  const TYPE_COLORS = { income: "#16a34a", expense: "#dc2626", transfer: "#64748b" };
  const TYPE_LABELS = { income: "הכנסה", expense: "הוצאה", transfer: "העברה" };
  const MIXED_COLOR = "#662249";

  function groupByCard() {
    // Filters + grouping/measure survive a refresh and switching tabs and back
    // (browser-only UI state, never written into the real data file).
    const persisted = PF.ui.persistentObject("pf_dashboard_groupby_v1", {
      from: "", to: "", accountId: "", categoryId: "", type: "expense", cardIds: [], unclassified: false, search: "",
      groupBy: "category", measure: "amount"
    });
    const filters = persisted.state;

    const groupBySelect = h("select", {}, [
      ["category", "קטגוריה"], ["month", "חודש"], ["card", "כרטיס"],
      ["account", "חשבון"], ["payee", "תיאור/בית עסק"], ["type", "סוג תנועה"]
    ].map(([val, label]) => h("option", { value: val, selected: val === filters.groupBy }, [label])));
    groupBySelect.addEventListener("change", () => { filters.groupBy = groupBySelect.value; renderChart(); });

    const measureSelect = h("select", {}, [
      ["amount", "סכום"], ["count", "מספר תנועות"]
    ].map(([val, label]) => h("option", { value: val, selected: val === filters.measure }, [label])));
    measureSelect.addEventListener("change", () => { filters.measure = measureSelect.value; renderChart(); });

    const fromInput = h("input", { type: "date", value: filters.from });
    fromInput.addEventListener("change", () => { filters.from = fromInput.value; renderChart(); });
    const toInput = h("input", { type: "date", value: filters.to });
    toInput.addEventListener("change", () => { filters.to = toInput.value; renderChart(); });
    const accSelect = h("select", {}, [h("option", { value: "" }, ["כל החשבונות"]), ...PF.ui.accountOptions(filters.accountId)]);
    accSelect.addEventListener("change", () => { filters.accountId = accSelect.value; renderChart(); });
    const typeSelect = h("select", {}, [
      h("option", { value: "", selected: !filters.type }, ["כל הסוגים"]),
      h("option", { value: "income", selected: filters.type === "income" }, ["הכנסה"]),
      h("option", { value: "expense", selected: filters.type === "expense" }, ["הוצאה"]),
      h("option", { value: "transfer", selected: filters.type === "transfer" }, ["העברה"])
    ]);
    typeSelect.addEventListener("change", () => { filters.type = typeSelect.value; renderChart(); });
    const allCats = [...PF.categories.all("income"), ...PF.categories.all("expense")];
    const catSelect = h("select", {}, [
      h("option", { value: "", selected: !filters.categoryId }, ["כל הקטגוריות"]),
      ...allCats.map(c => h("option", { value: c.id, selected: c.id === filters.categoryId }, [c.name]))
    ]);
    catSelect.addEventListener("change", () => { filters.categoryId = catSelect.value; renderChart(); });
    const searchInput = h("input", { type: "text", placeholder: "חיפוש חופשי (תיאור / הערות)", value: filters.search });
    searchInput.addEventListener("input", () => { filters.search = searchInput.value; renderChart(); });
    const unclassifiedCb = h("label", { style: "display:flex; align-items:center; gap:6px; white-space:nowrap" }, [
      h("input", { type: "checkbox", checked: filters.unclassified, onchange: e => { filters.unclassified = e.target.checked; renderChart(); } }),
      "רק לא מסווג"
    ]);

    // Filters, group-by and card checkboxes all live in a narrow sidebar
    // instead of a full-width toolbar, so the chart itself gets most of the
    // card's width. In this RTL layout the first flex child sits on the
    // right, so the sidebar (declared first in the row below) lands to the
    // right of the chart.
    const filterCol = h("div", { style: "display:flex; flex-direction:column; gap:8px" }, [fromInput, toInput, accSelect, typeSelect, catSelect, searchInput, unclassifiedCb]);
    const groupCol = h("div", { style: "margin-top:8px; display:flex; flex-direction:column; gap:8px" }, [
      h("div", { class: "field" }, [h("label", {}, ["קבץ לפי"]), groupBySelect]),
      h("div", { class: "field" }, [h("label", {}, ["מדד"]), measureSelect])
    ]);

    const cardFilterCol = h("div", { style: "display:flex; flex-direction:column; gap:6px; margin-top:8px" });
    if (PF.cards.all().length) {
      cardFilterCol.appendChild(h("span", { style: "font-weight:600" }, ["כרטיסים:"]));
      PF.cards.all().forEach(c => {
        const cb = h("input", { type: "checkbox", checked: filters.cardIds.includes(c.id) });
        cb.addEventListener("change", () => {
          filters.cardIds = filters.cardIds.filter(id => id !== c.id);
          if (cb.checked) filters.cardIds.push(c.id);
          renderChart();
        });
        cardFilterCol.appendChild(h("label", { style: "display:flex; align-items:center; gap:4px" }, [cb, c.name]));
      });
    }

    const chartWrap = h("div", { class: "chart-wrap" }, [h("canvas", { id: "chart-groupby" })]);
    const listWrap = h("div", {});
    const titleEl = h("h3", {}, ["ניתוח לפי קבוצה"]);

    const sidebar = h("div", { style: "flex:0 0 220px" }, [filterCol, groupCol, cardFilterCol]);
    const main = h("div", { style: "flex:1 1 auto; min-width:0" }, [chartWrap, listWrap]);

    // One sortable value + a color per group. groupKey() decides which
    // bucket a row falls into; colorForTypes() decides the bar's color from
    // the mix of transaction types that fed it — a pure bucket (e.g.
    // grouping by category with the type filter set to "הוצאה") gets its
    // type's color (red here), a genuinely mixed one falls back to blue.
    function groupKey(t) {
      switch (filters.groupBy) {
        case "month": return t.date.slice(0, 7);
        case "category": {
          if (t.type === "transfer") return "(העברה)";
          const cat = t.categoryId ? PF.categories.byId(t.categoryId) : null;
          return cat ? cat.name : (t.isAdjustment ? "התאמת יתרה" : "לא מסווג");
        }
        case "card": return t.cardId ? (PF.cards.byId(t.cardId) || {}).name || "לא ידוע" : "ללא כרטיס";
        case "account": {
          if (t.type === "transfer") {
            const from = data.accounts.find(a => a.id === t.fromAccountId);
            const to = data.accounts.find(a => a.id === t.toAccountId);
            return `${from ? from.name : "?"} ← ${to ? to.name : "?"}`;
          }
          const acc = data.accounts.find(a => a.id === t.accountId);
          return acc ? acc.name : "?";
        }
        case "payee": return (t.payee || "").trim() || "(ללא תיאור)";
        case "type": return TYPE_LABELS[t.type] || t.type;
        default: return "?";
      }
    }

    function colorForTypes(byType) {
      const present = Object.keys(byType).filter(k => byType[k]);
      if (present.length === 1) return TYPE_COLORS[present[0]] || MIXED_COLOR;
      return MIXED_COLOR;
    }

    function renderChart() {
      persisted.save(); // single choke point — every filter/group/measure change lands here
      const rows = PF.transactions.filter(filters);
      const groups = {};
      rows.forEach(t => {
        const key = groupKey(t);
        groups[key] = groups[key] || { sum: 0, count: 0, byType: { income: 0, expense: 0, transfer: 0 } };
        groups[key].sum += t.amount;
        groups[key].count += 1;
        groups[key].byType[t.type] = (groups[key].byType[t.type] || 0) + t.amount;
      });
      let entries = Object.entries(groups).map(([key, g]) => [key, filters.measure === "amount" ? g.sum : g.count, colorForTypes(g.byType)]);
      // A month grouping is a trend — keep it chronological. Everything else
      // is a ranking, so the biggest/most-frequent group belongs on top.
      if (filters.groupBy === "month") entries.sort((a, b) => a[0] < b[0] ? -1 : 1);
      else entries.sort((a, b) => b[1] - a[1]);
      const TOP_N = 20;
      const shown = entries.slice(0, TOP_N);

      listWrap.innerHTML = "";
      if (!shown.length) {
        listWrap.appendChild(h("p", { class: "empty-state" }, ["אין תנועות התואמות לסינון."]));
      } else {
        const list = h("table");
        list.appendChild(h("tbody", {}, shown.map(([key, val]) =>
          h("tr", {}, [h("td", {}, [filters.groupBy === "month" ? PF.simulate.monthLabel(key) : key]),
            h("td", { class: "amount" }, [filters.measure === "amount" ? money(val) : String(val)])])
        )));
        listWrap.appendChild(list);
        if (entries.length > TOP_N) listWrap.appendChild(h("p", { class: "empty-state" }, [`+ עוד ${entries.length - TOP_N} קבוצות`]));
      }

      PF.dashboard.renderOrUpdate("chart-groupby", {
        type: "bar",
        data: {
          labels: shown.map(([key]) => filters.groupBy === "month" ? PF.simulate.monthLabel(key) : key),
          datasets: [{
            label: filters.measure === "amount" ? "סכום" : "מספר תנועות",
            data: shown.map(([, val]) => val),
            backgroundColor: shown.map(([, , color]) => color)
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          indexAxis: filters.groupBy === "month" ? "x" : "y",
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => filters.measure === "amount" ? money(c.parsed[filters.groupBy === "month" ? "y" : "x"]) : c.parsed[filters.groupBy === "month" ? "y" : "x"] } }
          }
        }
      });
    }

    const card = h("div", { class: "card" }, [
      titleEl,
      h("div", { class: "row", style: "align-items:flex-start" }, [sidebar, main])
    ]);
    requestAnimationFrame(renderChart);
    return card;
  }
};
