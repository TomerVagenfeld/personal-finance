window.PF = window.PF || {};
PF.views = PF.views || {};

PF.views.simulate = function (root) {
  const { h, money } = PF.ui;
  const data = PF.store.data;
  const S = PF.simulate;

  if (!data.accounts.length) {
    root.appendChild(h("div", { class: "card" }, [h("p", { class: "empty-state" }, ["אין עדיין חשבונות."])]));
    return;
  }

  const bankAcc = data.accounts.find(a => a.type === "bank") || data.accounts[0];
  S.ensureInitialized(bankAcc);
  const items = S.scenario.items; // persists across re-renders/tab switches — see simulate.js

  // --- Header + month/horizon controls -------------------------------------
  const monthSelect = h("select", {}, S.horizonMonths(S.addMonths(S.currentMonth(), -1), 14).map(m =>
    h("option", { value: m, selected: m === S.scenario.targetMonth }, [S.monthLabel(m)])
  ));
  monthSelect.addEventListener("change", () => {
    S.setTargetMonth(bankAcc, monthSelect.value);
    PF.app.render();
  });
  const horizonSelect = h("select", {}, [1, 2, 3, 6, 12].map(n =>
    h("option", { value: n, selected: n === S.scenario.horizon }, [`${n} חודשים`])
  ));
  horizonSelect.addEventListener("change", () => { S.scenario.horizon = Number(horizonSelect.value); renderResults(); });

  // Which accounts feed the headline "יתרה כוללת" figure (chart/banner/dip
  // column) — defaults to every liquid account (bank+cash+Bit+investment,
  // same as the dashboard), but can be narrowed down (e.g. "just the bank
  // account") without changing which account each item actually hits.
  const defaultLiquidIds = data.accounts.filter(a => !PF.accounts.EXCLUDED_FROM_TOTAL.includes(a.type)).map(a => a.id);
  const effectiveIncludeIds = S.scenario.includeAccountIds || defaultLiquidIds;
  const accountChecks = data.accounts.map(a => {
    const cb = h("input", { type: "checkbox", checked: effectiveIncludeIds.includes(a.id) });
    cb.addEventListener("change", () => {
      const current = new Set(S.scenario.includeAccountIds || defaultLiquidIds);
      if (cb.checked) current.add(a.id); else current.delete(a.id);
      S.scenario.includeAccountIds = Array.from(current);
      S.persist();
      renderResults();
    });
    return h("label", { style: "display:flex; align-items:center; gap:6px; font-weight:500; color:var(--text)" }, [cb, a.name]);
  });

  root.appendChild(h("div", { class: "card" }, [
    h("div", { class: "row", style: "justify-content:space-between; align-items:center" }, [
      h("h2", { style: "margin:0" }, ["סימולציה"]),
      h("button", { class: "ghost", onclick: resetAll }, ["אפס לברירת מחדל"])
    ]),
    h("p", {}, ["הערכה בלבד — שום דבר כאן לא נשמר לנתונים האמיתיים. התרחיש נשאר כאן כל עוד הדף פתוח, גם אם תעברו ללשונית אחרת ותחזרו."]),
    h("div", { class: "row" }, [
      h("div", { class: "field" }, [h("label", {}, ["החל מחודש"]), monthSelect]),
      h("div", { class: "field" }, [h("label", {}, ["לכמה זמן קדימה"]), horizonSelect])
    ]),
    h("div", { class: "field" }, [
      h("label", {}, ["אילו חשבונות לכלול ב\"יתרה כוללת\" של הסימולציה"]),
      h("div", { style: "display:flex; flex-wrap:wrap; gap:14px" }, accountChecks)
    ])
  ]));

  // --- Custom one-off / recurring scenarios, kept near the top -------------
  const customRoot = h("div", {});
  root.appendChild(h("div", { class: "card" }, [
    h("div", { class: "row", style: "justify-content:space-between; align-items:center" }, [
      h("h3", { style: "margin:0" }, ["תרחישים (קנייה גדולה, הוצאה/הכנסה קבועה חדשה, העברה...)"]),
      h("button", { class: "small primary", onclick: addCustom }, ["+ הוסף תרחיש"])
    ]),
    h("p", {}, ["לדוגמה: קנייה חד-פעמית של ₪3,000, או תשלום חודשי קבוע חדש שמתחיל בחודש מסוים וממשיך הלאה."]),
    customRoot
  ]));
  renderCustom();

  const resultsRoot = h("div", {});
  root.appendChild(resultsRoot);

  root.appendChild(section("הכנסות צפויות (קבוע מדי חודש)", items.filter(i => i.kind === "income"), "income"));
  root.appendChild(section("הוצאות צפויות (ממוצע 3 חודשים, קבוע מדי חודש)", items.filter(i => i.kind === "expense"), "expense"));
  if (items.some(i => i.kind === "loan")) root.appendChild(section("תשלומי הלוואה צפויים (ממוצע 3 חודשים, קבוע מדי חודש)", items.filter(i => i.kind === "loan"), "expense"));

  renderResults();

  function resetAll() {
    S.resetScenario();
    PF.app.render();
  }

  function section(title, rows, kind) {
    const body = h("div", {});
    rows.forEach(it => body.appendChild(rowEl(it, kind)));
    return h("div", { class: "card" }, [h("h3", {}, [title]), body]);
  }

  function rowEl(it) {
    const cb = h("input", { type: "checkbox", checked: it.included, onchange: e => { it.included = e.target.checked; renderResults(); } });
    const amountInput = h("input", { type: "number", step: "0.01", value: it.amount, style: "width:110px" });
    amountInput.addEventListener("input", () => { it.amount = Number(amountInput.value) || 0; renderResults(); });
    const dayInput = h("input", { type: "number", min: "1", max: "31", value: it.day || 1, style: "width:60px", title: "יום בחודש" });
    dayInput.addEventListener("input", () => { it.day = Math.min(31, Math.max(1, Number(dayInput.value) || 1)); renderResults(); });
    const accSelect = h("select", { style: "max-width:260px" }, PF.ui.accountOptions(it.accountId || it.toAccountId));
    accSelect.addEventListener("change", () => {
      if (it.accountId !== undefined) it.accountId = accSelect.value; else it.toAccountId = accSelect.value;
      renderResults();
    });
    return h("div", { class: "scenario-row" }, [
      h("label", { class: "grow", style: "display:flex; align-items:center; gap:8px" }, [cb, it.label]),
      amountInput,
      h("span", { style: "display:flex; align-items:center; gap:4px" }, [h("span", {}, ["יום"]), dayInput]),
      accSelect
    ]);
  }

  function renderCustom() {
    customRoot.innerHTML = "";
    const customItems = items.filter(i => i.kind === "custom");
    if (!customItems.length) {
      customRoot.appendChild(h("p", { class: "empty-state" }, ["אין תרחישים נוספים עדיין."]));
      return;
    }
    customItems.forEach(it => customRoot.appendChild(customRowEl(it)));
  }

  function customRowEl(it) {
    const horizonList = S.horizonMonths(S.scenario.targetMonth, S.scenario.horizon);

    const labelInput = h("input", { type: "text", value: it.label, placeholder: "תיאור (לדוגמה: מחשב חדש)", style: "width:170px" });
    const typeSelect = h("select", { style: "width:100px" }, [
      h("option", { value: "expense", selected: it.type === "expense" }, ["הוצאה"]),
      h("option", { value: "income", selected: it.type === "income" }, ["הכנסה"]),
      h("option", { value: "transfer", selected: it.type === "transfer" }, ["העברה"])
    ]);
    const amountInput = h("input", { type: "number", step: "0.01", value: it.amount, style: "width:100px" });
    const recurringSelect = h("select", { style: "width:150px" }, [
      h("option", { value: "once", selected: !it.recurring }, ["חד-פעמי (חודש בודד)"]),
      h("option", { value: "recurring", selected: it.recurring }, ["קבוע (חוזר על עצמו)"])
    ]);
    const monthLabelSpan = h("span", {}, [it.recurring ? "מתחיל ב:" : "בחודש:"]);
    const monthSelect2 = h("select", { style: "width:140px" }, horizonList.map(m =>
      h("option", { value: m, selected: m === it.month }, [S.monthLabel(m)])
    ));
    const DURATION_OPTIONS = [1, 2, 3, 6, 12, 18, 24];
    const durationSelect = h("select", { style: "width:170px" }, [
      h("option", { value: "0", selected: !it.durationMonths }, ["ללא הגבלה (עד סוף האופק)"]),
      ...DURATION_OPTIONS.map(n => h("option", { value: String(n), selected: it.durationMonths === n }, [`למשך ${n} חודשים ואז נפסק`]))
    ]);
    const durationWrap = h("span", { style: it.recurring ? "" : "display:none" }, [h("span", {}, ["למשך:"]), durationSelect]);
    const dayInput = h("input", { type: "number", min: "1", max: "31", value: it.day || 1, style: "width:60px" });
    const accSelect = h("select", { style: "width:220px" }, PF.ui.accountOptions(it.accountId));
    const fromSelect = h("select", { style: "width:170px" }, PF.ui.accountOptions(it.fromAccountId));
    const toSelect = h("select", { style: "width:170px" }, PF.ui.accountOptions(it.toAccountId));
    const accWrap = h("span", { style: it.type === "transfer" ? "display:none" : "" }, [accSelect]);
    const transferWrap = h("span", { style: it.type === "transfer" ? "" : "display:none" }, [fromSelect, h("span", { style: "margin:0 4px" }, ["→"]), toSelect]);
    const includeCb = h("input", { type: "checkbox", checked: it.included });

    typeSelect.addEventListener("change", () => {
      it.type = typeSelect.value;
      accWrap.style.display = it.type === "transfer" ? "none" : "";
      transferWrap.style.display = it.type === "transfer" ? "" : "none";
      renderResults();
    });
    amountInput.addEventListener("input", () => { it.amount = Number(amountInput.value) || 0; renderResults(); });
    labelInput.addEventListener("input", () => { it.label = labelInput.value; });
    recurringSelect.addEventListener("change", () => {
      it.recurring = recurringSelect.value === "recurring";
      monthLabelSpan.textContent = it.recurring ? "מתחיל ב:" : "בחודש:";
      durationWrap.style.display = it.recurring ? "" : "none";
      renderResults();
    });
    monthSelect2.addEventListener("change", () => { it.month = monthSelect2.value; renderResults(); });
    durationSelect.addEventListener("change", () => { it.durationMonths = Number(durationSelect.value) || null; renderResults(); });
    dayInput.addEventListener("input", () => { it.day = Math.min(31, Math.max(1, Number(dayInput.value) || 1)); renderResults(); });
    accSelect.addEventListener("change", () => { it.accountId = accSelect.value; renderResults(); });
    fromSelect.addEventListener("change", () => { it.fromAccountId = fromSelect.value; renderResults(); });
    toSelect.addEventListener("change", () => { it.toAccountId = toSelect.value; renderResults(); });
    includeCb.addEventListener("change", () => { it.included = includeCb.checked; renderResults(); });

    const removeBtn = h("button", { class: "small", onclick: () => { S.removeItem(it); renderCustom(); renderResults(); } }, ["מחק"]);

    return h("div", { class: "scenario-row", style: "flex-direction:column; align-items:stretch" }, [
      h("div", { class: "scenario-row", style: "padding:0; border:none" }, [includeCb, labelInput, typeSelect, amountInput, removeBtn]),
      h("div", { class: "scenario-row", style: "padding:0; border:none" }, [
        h("span", {}, ["תזמון:"]), recurringSelect, monthLabelSpan, monthSelect2, durationWrap,
        h("span", {}, ["יום בחודש:"]), dayInput,
        h("span", {}, ["חשבון:"]), accWrap, transferWrap
      ])
    ]);
  }

  function addCustom() {
    S.addCustomItem({
      type: "expense", label: "", amount: 0,
      accountId: bankAcc.id,
      fromAccountId: bankAcc.id, toAccountId: (data.accounts.find(a => a.type === "shared_bank") || bankAcc).id
    });
    renderCustom();
    renderResults();
  }

  // "YYYY-MM-DD" -> compact "D/M/YY", so the chart's x-axis reads as actual
  // dates (when money really lands/leaves) instead of one tick per month.
  function dayLabel(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${d}/${m}/${String(y).slice(2)}`;
  }

  function renderResults() {
    S.persist(); // single choke point — called after every scenario edit, so this is where state gets saved to localStorage
    resultsRoot.innerHTML = "";
    const includeIds = S.scenario.includeAccountIds || defaultLiquidIds;
    const { months, timeline, firstProblem, monthMinLiquid, dailyTrace } = S.projectTimeline(items, S.scenario.targetMonth, S.scenario.horizon, includeIds);
    const current = S.currentBalances();
    const liquidAccounts = data.accounts.filter(a => includeIds.includes(a.id));

    // Problems are now checked DAY BY DAY within each month (see simulate.js),
    // not just at month-end — so this can catch a dip that happens mid-month
    // (e.g. the card charge on the 10th landing before that month's income)
    // even if the month closes out fine.
    const dayNote = firstProblem && firstProblem.day ? ` (יום ${firstProblem.day} בחודש)` : "";
    const banner = firstProblem
      ? h("div", { class: "card", style: "border-color:#dc2626; background:#fef2f2" }, [
          h("strong", {}, [`⚠️ בעיה צפויה ב${S.monthLabel(firstProblem.month)}${dayNote}: `]),
          `${firstProblem.account.name} צפוי להיות ${money(firstProblem.balance)}`
        ])
      : h("div", { class: "card", style: "border-color:#16a34a; background:#f0fdf4" }, [
          h("strong", {}, [`✓ נראה תקין לאורך כל ${months.length} החודשים — אף חשבון לא צפוי להיות שלילי, גם לא באמצע החודש.`])
        ]);
    resultsRoot.appendChild(banner);

    // Total liquid balance per month (headline figure, same exclusions as the dashboard).
    const liquidByMonth = timeline.map(snap => Math.round(liquidAccounts.reduce((s, a) => s + (snap.balances[a.id] || 0), 0) * 100) / 100);
    const currentLiquid = Math.round(liquidAccounts.reduce((s, a) => s + current[a.id], 0) * 100) / 100;

    // Baseline = the same forecast with only the auto-estimated items (income
    // templates, average expenses, average loan payment) — i.e. "if I add no
    // new scenarios". Comparing it against the full forecast (which also
    // includes your custom scenarios) is how their effect becomes visible: the
    // GAP between the two lines at a given month *is* what that scenario did
    // to your balance by then, instead of it being buried under your regular
    // income/expenses or shown as a disconnected marker.
    const baselineItems = items.filter(it => it.kind !== "custom");
    const { timeline: baselineTimeline, dailyTrace: baselineDailyTrace } = S.projectTimeline(baselineItems, S.scenario.targetMonth, S.scenario.horizon, includeIds);
    const baselineByMonth = baselineTimeline.map(snap => Math.round(liquidAccounts.reduce((s, a) => s + (snap.balances[a.id] || 0), 0) * 100) / 100);

    // Chart ticks are grouped by DAY (not one point per month) using every
    // day something actually lands/leaves from either projection — so you
    // can see exactly when money comes and goes, not just where each month
    // ends up. The two traces don't necessarily share event days (a custom
    // scenario only exists in the "with scenarios" one), so each is
    // step-forward-filled across the union of both sets of dates.
    const allDates = Array.from(new Set([...dailyTrace.map(p => p.date), ...baselineDailyTrace.map(p => p.date)])).sort();
    function fillSeries(trace) {
      const byDate = new Map(trace.map(p => [p.date, p.value]));
      let last = trace.length ? trace[0].value : 0;
      return allDates.map(d => { if (byDate.has(d)) last = byDate.get(d); return last; });
    }
    const chartLabels = allDates.map(dayLabel);
    const liquidSeries = fillSeries(dailyTrace);
    const baselineSeries = fillSeries(baselineDailyTrace);
    const hasScenarios = items.some(it => it.kind === "custom" && it.included && it.amount);

    // Monthly cash flow: every included income/expense item that applies in
    // a given month — a flow (how much moves THAT month), which is a
    // different kind of question than the balance line (a level), so it gets
    // its own bar chart rather than sharing an axis with it. Split into the
    // auto-estimated baseline vs. your own added scenarios (same split as the
    // balance chart above) and stacked, so the scenarios' slice of each bar
    // is visible rather than blended into one number.
    function flowFor(kind, type) {
      return months.map(m => Math.round(items.reduce((sum, it) =>
        (!it.included || !it.amount || it.type !== type || it.kind === "custom" !== (kind === "custom") || !S.itemAppliesInMonth(it, m))
          ? sum : sum + it.amount, 0) * 100) / 100);
    }
    const baselineIncomeFlow = flowFor("baseline", "income");
    const scenarioIncomeFlow = flowFor("custom", "income");
    const baselineExpenseFlow = flowFor("baseline", "expense");
    const scenarioExpenseFlow = flowFor("custom", "expense");

    resultsRoot.appendChild(h("div", { class: "card" }, [
      h("h3", {}, ["יתרה צפויה לאורך זמן"]),
      h("p", { class: "empty-state" }, hasScenarios
        ? ["הקו המקווקו הוא התחזית בלי התרחישים שהוספתם; הקו המלא כולל אותם. הפער בין שני הקווים הוא ההשפעה שלהם."]
        : ["אין עדיין תרחישים — שני הקווים זהים. הוסיפו תרחיש למעלה כדי לראות איך הוא משפיע."]),
      h("div", { class: "chart-wrap" }, [h("canvas", { id: "sim-balance-chart" })])
    ]));

    resultsRoot.appendChild(h("div", { class: "card" }, [
      h("h3", {}, ["תזרים חודשי: הכנסות מול הוצאות"]),
      h("p", { class: "empty-state" }, hasScenarios
        ? ["החלק הכהה הוא הבסיס (הערכות קבועות); החלק הבהיר הוא התרחישים שהוספתם."]
        : ["אין עדיין תרחישים — כל החלק כאן הוא הבסיס. הוסיפו תרחיש למעלה כדי לראות את חלקו בעמודה."]),
      h("div", { class: "chart-wrap" }, [h("canvas", { id: "sim-flow-chart" })])
    ]));

    const table = h("table", {}, [
      h("thead", {}, [h("tr", {}, ["חודש", "יתרה כוללת (סוף חודש)", "שפל באמצע החודש", ...data.accounts.map(a => a.name)].map(t => h("th", {}, [t])))]),
      h("tbody", {}, timeline.map((snap, i) => h("tr", {}, [
        h("td", {}, [S.monthLabel(snap.month)]),
        h("td", { class: "amount " + (liquidByMonth[i] < 0 ? "expense" : "income") }, [money(liquidByMonth[i])]),
        h("td", { class: "amount " + (monthMinLiquid[i].value < 0 ? "expense" : "") },
          [`${money(monthMinLiquid[i].value)} ${monthMinLiquid[i].day ? `(יום ${monthMinLiquid[i].day})` : "(תחילת החודש)"}`]),
        ...data.accounts.map(a => h("td", { class: snap.balances[a.id] < 0 && a.type !== "external" ? "amount expense" : "" }, [money(snap.balances[a.id])]))
      ])))
    ]);
    resultsRoot.appendChild(h("div", { class: "card" }, [h("h3", {}, ["פירוט לפי חשבון וחודש"]), table]));

    requestAnimationFrame(() => {
      PF.dashboard.renderOrUpdate("sim-balance-chart", {
        type: "line",
        data: {
          labels: chartLabels,
          datasets: [
            {
              label: "יתרה (ללא תרחישים חדשים)", data: baselineSeries,
              borderColor: "#c2a4a0", backgroundColor: "#c2a4a0", borderDash: [6, 4], tension: 0, pointRadius: 4, pointHoverRadius: 7, pointHitRadius: 10
            },
            {
              label: "יתרה (עם תרחישים)", data: liquidSeries,
              borderColor: "#662249", backgroundColor: "#662249", tension: 0, pointRadius: 4, pointHoverRadius: 7, pointHitRadius: 10
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: false },
          plugins: { tooltip: { callbacks: { label: context => `${context.dataset.label}: ${money(context.parsed.y)}` } } }
        }
      });

      PF.dashboard.renderOrUpdate("sim-flow-chart", {
        type: "bar",
        data: {
          labels: months.map(S.monthLabel),
          datasets: [
            { label: "הכנסות (בסיס)", data: baselineIncomeFlow, backgroundColor: "#16a34a", stack: "income" },
            { label: "הכנסות (תרחישים)", data: scenarioIncomeFlow, backgroundColor: "#86efac", stack: "income" },
            { label: "הוצאות (בסיס)", data: baselineExpenseFlow, backgroundColor: "#dc2626", stack: "expense" },
            { label: "הוצאות (תרחישים)", data: scenarioExpenseFlow, backgroundColor: "#fca5a5", stack: "expense" }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true } },
          plugins: { tooltip: { callbacks: { label: context => `${context.dataset.label}: ${money(context.parsed.y)}` } } }
        }
      });
    });
  }
};
