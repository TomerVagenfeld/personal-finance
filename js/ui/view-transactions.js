window.PF = window.PF || {};
PF.views = PF.views || {};

PF.views.transactions = function (root) {
  const { h, money } = PF.ui;

  // Filters + sort survive a refresh and switching tabs and back (browser-only
  // UI state, never written into the real data file - see PF.ui.persistentObject).
  const persisted = PF.ui.persistentObject("pf_transactions_state_v1", {
    from: "", to: "", accountId: "", categoryId: "", type: "", cardIds: [], unclassified: false, search: "",
    suspectedDuplicate: false, sortKey: "date", sortDir: "desc"
  });
  const filters = persisted.state;
  const sort = { get key() { return filters.sortKey; }, set key(v) { filters.sortKey = v; }, get dir() { return filters.sortDir; }, set dir(v) { filters.sortDir = v; } };

  const form = addForm();
  root.appendChild(form.el);
  const toolbar = h("div", { class: "toolbar" });
  const fromInput = h("input", { type: "date", value: filters.from, onchange: e => { filters.from = e.target.value; renderTable(); } });
  const toInput = h("input", { type: "date", value: filters.to, onchange: e => { filters.to = e.target.value; renderTable(); } });
  const accSelect = h("select", { onchange: e => { filters.accountId = e.target.value; renderTable(); } }, [h("option", { value: "" }, ["כל החשבונות"]), ...PF.ui.accountOptions(filters.accountId)]);
  const typeSelect = h("select", { onchange: e => { filters.type = e.target.value; renderTable(); } }, [
    h("option", { value: "", selected: !filters.type }, ["כל הסוגים"]),
    h("option", { value: "income", selected: filters.type === "income" }, ["הכנסה"]),
    h("option", { value: "expense", selected: filters.type === "expense" }, ["הוצאה"]),
    h("option", { value: "transfer", selected: filters.type === "transfer" }, ["העברה"])
  ]);
  const allCats = [...PF.categories.all("income"), ...PF.categories.all("expense")];
  const catSelect = h("select", { onchange: e => { filters.categoryId = e.target.value; renderTable(); } }, [
    h("option", { value: "", selected: !filters.categoryId }, ["כל הקטגוריות"]),
    ...allCats.map(c => h("option", { value: c.id, selected: c.id === filters.categoryId }, [c.name]))
  ]);
  const searchInput = h("input", { type: "text", placeholder: "חיפוש חופשי (תיאור / הערות)", value: filters.search });
  searchInput.addEventListener("input", () => { filters.search = searchInput.value; renderTable(); });
  const unclassifiedCb = h("label", { style: "display:flex; align-items:center; gap:6px; white-space:nowrap" }, [
    h("input", { type: "checkbox", checked: filters.unclassified, onchange: e => { filters.unclassified = e.target.checked; renderTable(); } }),
    "רק לא מסווג"
  ]);
  const suspectedDuplicateCb = h("label", { style: "display:flex; align-items:center; gap:6px; white-space:nowrap" }, [
    h("input", { type: "checkbox", checked: filters.suspectedDuplicate, onchange: e => { filters.suspectedDuplicate = e.target.checked; renderTable(); } }),
    "רק חשודים ככפולים"
  ]);

  toolbar.appendChild(h("div", { class: "filters" }, [fromInput, toInput, accSelect, typeSelect, catSelect, searchInput, unclassifiedCb, suspectedDuplicateCb]));

  // Card filter: checkboxes, not a single <select> - lets you look at "all
  // cards", one specific card, or any subset of them at once. Empty selection
  // (the default) means no card filtering at all.
  if (PF.cards.all().length) {
    const cardFilterRow = h("div", { class: "row", style: "flex-wrap:wrap; gap:10px; margin-top:8px" });
    cardFilterRow.appendChild(h("span", { style: "font-weight:600" }, ["כרטיסים:"]));
    PF.cards.all().forEach(c => {
      const cb = h("input", { type: "checkbox", checked: filters.cardIds.includes(c.id) });
      cb.addEventListener("change", () => {
        filters.cardIds = filters.cardIds.filter(id => id !== c.id);
        if (cb.checked) filters.cardIds.push(c.id);
        renderTable();
      });
      cardFilterRow.appendChild(h("label", { style: "display:flex; align-items:center; gap:4px" }, [cb, c.name]));
    });
    toolbar.appendChild(cardFilterRow);
  }

  root.appendChild(h("div", { class: "card" }, [h("h2", {}, ["תנועות"]), toolbar, h("div", { id: "txn-table-wrap" })]));

  // One sortable value per column, matching exactly what that column shows —
  // category/account for the "קטגוריה/חשבונות" column (its own text depends
  // on the row being a transfer or not), card name (or "" for none), the
  // Hebrew type label (so "הכנסה"/"הוצאה"/"העברה" sort the way they read),
  // and the always-positive amount field.
  const TYPE_LABELS = { income: "הכנסה", expense: "הוצאה", transfer: "העברה" };
  function sortValue(t, key) {
    switch (key) {
      case "date": return t.date;
      case "payee": return (t.payee || "").trim();
      case "category": {
        if (t.type === "transfer") {
          const from = PF.store.data.accounts.find(a => a.id === t.fromAccountId);
          const to = PF.store.data.accounts.find(a => a.id === t.toAccountId);
          return `${from ? from.name : "?"} ${to ? to.name : "?"}`;
        }
        const cat = t.categoryId ? PF.categories.byId(t.categoryId) : null;
        return cat ? cat.name : (t.isAdjustment ? "התאמת יתרה" : "");
      }
      case "card": return t.cardId ? (PF.cards.byId(t.cardId) || {}).name || "" : "";
      case "type": return TYPE_LABELS[t.type] || "";
      case "amount": return t.amount;
      default: return "";
    }
  }
  function sortRows(rows) {
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const va = sortValue(a, key), vb = sortValue(b, key);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
  }
  const SORT_COLUMNS = [
    ["date", "תאריך"], ["payee", "תיאור"], ["category", "קטגוריה/חשבונות"],
    ["card", "כרטיס"], ["type", "סוג"], ["amount", "סכום"]
  ];

  renderTable();

  function headerRow() {
    return h("tr", {}, [
      ...SORT_COLUMNS.map(([key, label]) => {
        const active = sort.key === key;
        const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
        const th = h("th", { style: "cursor:pointer; user-select:none" }, [label + arrow]);
        th.addEventListener("click", () => {
          // Clicking the already-active column flips direction; a new column
          // starts descending for date/amount (newest/biggest first) and
          // ascending for text columns (A→Z) - whichever reads naturally first.
          if (sort.key === key) sort.dir = sort.dir === "asc" ? "desc" : "asc";
          else { sort.key = key; sort.dir = (key === "date" || key === "amount") ? "desc" : "asc"; }
          renderTable();
        });
        return th;
      }),
      h("th", {}, [""])
    ]);
  }

  function renderTable() {
    persisted.save(); // single choke point — every filter/sort change lands here
    const wrap = document.getElementById("txn-table-wrap");
    wrap.innerHTML = "";
    // Computed once per render (not per row) — scans every transaction, same
    // cost regardless of how many rows pass the other filters.
    const suspectIndex = PF.dedupe.suspectedDuplicateIndex();
    let rows = sortRows(PF.transactions.filter(filters));
    if (filters.suspectedDuplicate) rows = rows.filter(t => suspectIndex[t.id]);
    if (!rows.length) { wrap.appendChild(h("p", { class: "empty-state" }, ["אין תנועות להצגה"])); return; }

    const table = h("table", {}, [
      h("thead", {}, [headerRow()]),
      h("tbody", {}, rows.map(t => rowEl(t, suspectIndex)))
    ]);
    wrap.appendChild(table);
  }

  function rowEl(t, suspectIndex) {
    const cat = t.categoryId ? PF.categories.byId(t.categoryId) : null;
    const catCell = h("td", {});
    if (t.type === "transfer") {
      const from = PF.store.data.accounts.find(a => a.id === t.fromAccountId);
      const to = PF.store.data.accounts.find(a => a.id === t.toAccountId);
      catCell.textContent = `${from ? from.name : "?"} ← ${to ? to.name : "?"}`;
    } else {
      const acc = PF.store.data.accounts.find(a => a.id === t.accountId);
      if (!cat && !t.isAdjustment) {
        // Quick-classify right from the list - no need to open the edit form
        // just to tag one of the "unclassified" rows the "רק לא מסווג" filter
        // just surfaced.
        const kind = t.type === "income" ? "income" : "expense";
        const picker = PF.ui.categoryPicker(kind, null, val => {
          if (!val) return;
          PF.transactions.update(t.id, { categoryId: val });
          PF.ui.toast("סווג");
          renderTable();
        }, "לא מסווג");
        catCell.appendChild(picker.el);
        catCell.appendChild(document.createTextNode(" · " + (acc ? acc.name : "")));
      } else {
        catCell.textContent = (cat ? cat.name : "התאמת יתרה") + " · " + (acc ? acc.name : "");
      }
    }
    const matches = suspectIndex && suspectIndex[t.id];
    if (matches && matches.length) {
      // Fuzzy match, not certain — e.g. the same purchase entered by hand and
      // later imported from the real statement. Shows what it's suspected
      // against so you can judge for yourself: delete the real duplicate (the
      // existing "מחק" button), or mark this specific pair as NOT a duplicate
      // so it stops being flagged.
      const note = h("div", { style: "margin-top:4px; font-size:12px" });
      matches.forEach(other => {
        const dismissBtn = h("button", { class: "small" }, ["לא כפול"]);
        dismissBtn.addEventListener("click", () => {
          PF.dedupe.dismissPair(t.id, other.id);
          PF.ui.toast("סומן כשתי תנועות נפרדות");
          renderTable();
        });
        note.appendChild(h("div", { class: "badge", style: "background:#fdeacb; color:#8a5a1a; display:flex; align-items:center; gap:6px; width:fit-content; margin-top:2px" }, [
          `⚠ דומה ל: ${other.payee || "-"} · ${other.date} · ${money(other.amount)}`,
          dismissBtn
        ]));
      });
      catCell.appendChild(note);
    }
    const card = t.cardId ? PF.cards.byId(t.cardId) : null;
    const typeLabel = { income: "הכנסה", expense: "הוצאה", transfer: "העברה" }[t.type];
    const amountClass = t.type === "income" ? "income" : t.type === "expense" ? "expense" : "";
    return h("tr", {}, [
      h("td", {}, [t.date]),
      h("td", {}, [t.payee || "-"]),
      catCell,
      h("td", {}, [card ? card.name : "-"]),
      h("td", {}, [typeLabel]),
      h("td", { class: "amount " + amountClass }, [money(t.amount)]),
      h("td", { style: "white-space:nowrap" }, [
        h("button", { class: "small", onclick: () => form.loadForEdit(t), style: "margin-left:4px" }, ["ערוך"]),
        h("button", { class: "small", onclick: () => removeTxn(t.id) }, ["מחק"])
      ])
    ]);
  }

  function removeTxn(id) {
    PF.transactions.remove(id);
    PF.ui.toast("התנועה נמחקה");
    PF.app.render();
  }

  function addForm() {
    let editingId = null;
    const typeSelect = h("select", {}, [
      h("option", { value: "expense" }, ["הוצאה"]),
      h("option", { value: "income" }, ["הכנסה"]),
      h("option", { value: "transfer" }, ["העברה"])
    ]);
    const dateInput = h("input", { type: "date", value: PF.ui.todayStr() });
    const amountInput = h("input", { type: "number", step: "0.01" });
    const payeeInput = h("input", { type: "text", placeholder: "תיאור / בית עסק" });

    const accountSelect = h("select", {}, PF.ui.accountOptions());
    const categoryPicker = PF.ui.categoryPicker("expense", null);
    const cardSelect = h("select", {}, [h("option", { value: "" }, ["ללא שיוך"]), ...PF.ui.cardOptions()]);
    const fromSelect = h("select", {}, PF.ui.accountOptions());
    const toSelect = h("select", {}, PF.ui.accountOptions());
    const accountWrap = h("div", { class: "field" }, [h("label", {}, ["חשבון"]), accountSelect]);
    const categoryWrap = h("div", { class: "field" }, [h("label", {}, ["קטגוריה"]), categoryPicker.el]);
    const cardWrap = PF.cards.all().length ? h("div", { class: "field" }, [h("label", {}, ["כרטיס"]), cardSelect]) : null;
    const fromWrap = h("div", { class: "field", style: "display:none" }, [h("label", {}, ["מחשבון"]), fromSelect]);
    const toWrap = h("div", { class: "field", style: "display:none" }, [h("label", {}, ["לחשבון"]), toSelect]);

    const titleEl = h("h3", {}, ["הוספת תנועה"]);
    const submitBtn = h("button", { class: "primary", onclick: submit }, ["שמור תנועה"]);
    const cancelBtn = h("button", { class: "ghost", onclick: cancelEdit, style: "display:none" }, ["בטל עריכה"]);

    function refreshCategoryOptions(kind, selectedId) {
      categoryPicker.setKind(kind, selectedId);
    }

    function applyTypeVisibility() {
      const isTransfer = typeSelect.value === "transfer";
      accountWrap.style.display = isTransfer ? "none" : "";
      categoryWrap.style.display = isTransfer ? "none" : "";
      if (cardWrap) cardWrap.style.display = isTransfer ? "none" : "";
      fromWrap.style.display = isTransfer ? "" : "none";
      toWrap.style.display = isTransfer ? "" : "none";
    }

    typeSelect.addEventListener("change", () => {
      applyTypeVisibility();
      refreshCategoryOptions(typeSelect.value === "income" ? "income" : "expense");
    });

    function loadForEdit(t) {
      editingId = t.id;
      typeSelect.value = t.type;
      applyTypeVisibility();
      dateInput.value = t.date;
      amountInput.value = t.amount;
      payeeInput.value = t.payee || "";
      if (t.type === "transfer") {
        fromSelect.value = t.fromAccountId;
        toSelect.value = t.toAccountId;
      } else {
        accountSelect.value = t.accountId;
        refreshCategoryOptions(t.type === "income" ? "income" : "expense", t.categoryId);
        cardSelect.value = t.cardId || "";
      }
      titleEl.textContent = "עריכת תנועה";
      submitBtn.textContent = "עדכן תנועה";
      cancelBtn.style.display = "";
      titleEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function resetForm() {
      editingId = null;
      typeSelect.value = "expense";
      applyTypeVisibility();
      refreshCategoryOptions("expense");
      dateInput.value = PF.ui.todayStr();
      amountInput.value = "";
      payeeInput.value = "";
      cardSelect.value = "";
      titleEl.textContent = "הוספת תנועה";
      submitBtn.textContent = "שמור תנועה";
      cancelBtn.style.display = "none";
    }

    function cancelEdit() {
      resetForm();
    }

    const el = h("div", { class: "card" }, [
      titleEl,
      h("div", { class: "row" }, [
        h("div", { class: "field" }, [h("label", {}, ["סוג"]), typeSelect]),
        h("div", { class: "field" }, [h("label", {}, ["תאריך"]), dateInput]),
        h("div", { class: "field" }, [h("label", {}, ["סכום"]), amountInput])
      ]),
      h("div", { class: "row" }, [
        h("div", { class: "field" }, [h("label", {}, ["תיאור"]), payeeInput]),
        accountWrap, categoryWrap, cardWrap, fromWrap, toWrap
      ]),
      h("div", { class: "row", style: "flex:0 0 auto" }, [submitBtn, cancelBtn])
    ]);

    function submit() {
      const amount = Number(amountInput.value);
      if (!amount || amount <= 0) { PF.ui.toast("יש להזין סכום חיובי"); return; }
      const type = typeSelect.value;
      const base = { date: dateInput.value || PF.ui.todayStr(), amount, type, payee: payeeInput.value.trim() };
      let patch;
      if (type === "transfer") {
        const fromId = fromSelect.value;
        const toId = toSelect.value;
        if (fromId === toId) { PF.ui.toast("חשבון המקור והיעד חייבים להיות שונים"); return; }
        patch = { ...base, fromAccountId: fromId, toAccountId: toId, accountId: undefined, categoryId: undefined };
      } else {
        patch = { ...base, accountId: accountSelect.value, categoryId: categoryPicker.getValue() || null, cardId: cardSelect.value || null, fromAccountId: undefined, toAccountId: undefined };
      }
      if (editingId) {
        PF.transactions.update(editingId, patch);
        PF.ui.toast("התנועה עודכנה");
      } else {
        PF.transactions.add(patch);
        PF.ui.toast("התנועה נשמרה");
      }
      resetForm();
      PF.app.render();
    }

    return { el, loadForEdit };
  }
};
