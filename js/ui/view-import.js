window.PF = window.PF || {};
PF.views = PF.views || {};

PF.views.import = function (root) {
  const { h, money } = PF.ui;
  const batches = []; // { fileName, profileLabel, accountId, rows: [...] }

  const fileInput = h("input", { type: "file", accept: ".xlsx,.xls,.csv", multiple: true, onchange: onFiles });
  root.appendChild(h("div", { class: "card" }, [
    h("h2", {}, ["ייבוא קבצים"]),
    h("p", {}, ["ניתן לבחור כמה קבצים בבת אחת: פירוט עסקאות כרטיס אשראי (כאל / ישראכרט) או תנועות בנק. הקבצים מזוהים אוטומטית לפי המבנה שלהם."]),
    fileInput
  ]));

  const resultsRoot = h("div", {});
  root.appendChild(resultsRoot);

  async function onFiles(ev) {
    const files = Array.from(ev.target.files || []);
    for (const file of files) {
      try {
        const wb = await PF.importParse.readWorkbook(file);
        const profile = PF.importProfiles.detectProfile(wb);
        if (!profile) {
          batches.push({ fileName: file.name, profileLabel: "לא זוהה פורמט - נדרשת קטגוריה ידנית", rows: [], unrecognized: true, accountId: PF.accounts.all()[0]?.id });
          continue;
        }
        const parsed = profile.parse(wb).map(normalizeRow);
        const guessAccount = guessDefaultAccount(profile.id);
        const annotated = PF.dedupe.annotate(parsed, guessAccount);
        const rows = annotated.map(r => ({
          ...r,
          include: !r.isDuplicate,
          resolvedCategoryId: resolveCategory(r),
          resolvedCardId: resolveCard(r)
        }));
        batches.push({ fileName: file.name, profileLabel: profile.label, profileId: profile.id, accountId: guessAccount, rows });
      } catch (e) {
        PF.ui.toast(`שגיאה בקריאת ${file.name}: ${e.message}`);
      }
    }
    fileInput.value = "";
    renderBatches();
  }

  // Known renames applied BEFORE dedupe hashing, so a re-import of the same
  // period still matches what's already stored under the new name. The
  // ₪430 PayBox charge is a recurring personal payment to שרי, not a
  // merchant purchase — give it her name and the personal-transfers category
  // right away instead of leaving every future import of it generic.
  function normalizeRow(row) {
    if (/^paybox$/i.test((row.payee || "").trim()) && Math.abs(row.amount) === 430) {
      return { ...row, payee: "שרי", categoryNameSuggestion: "העברות אישיות" };
    }
    return row;
  }

  function guessDefaultAccount(profileId) {
    const accs = PF.accounts.all();
    const bank = accs.find(a => a.type === "bank");
    return (bank || accs[0] || {}).id;
  }

  // A row tagged suggestBitTransfer is really a transfer between two of your
  // own tracked accounts (money moving from Bit into the bank), not new
  // income — this finds the "other side" of that transfer by account type.
  function linkedAccountFor(row) {
    if (row.suggestBitTransfer) return PF.store.data.accounts.find(a => a.type === "bit");
    return null;
  }

  // A row tagged suggestLoanPayment is real spending (a loan isn't an
  // account — see PF.loans), so it isn't a transfer at all: it resolves to
  // whichever loan it should be tagged against.
  function linkedLoanFor(row) {
    return row.suggestLoanPayment ? (PF.loans.all()[0] || null) : null;
  }

  function resolveCategory(row) {
    if (row.suggestTransfer || row.suggestBitTransfer) return null; // handled as an inter-account transfer instead
    const loan = linkedLoanFor(row);
    if (loan) {
      const loanCat = PF.categories.findByName("הלוואה", "expense") || PF.categories.add("הלוואה", "expense");
      return loanCat.id;
    }
    if (row.categoryNameSuggestion) {
      const kind = row.type === "income" ? "income" : "expense";
      const cat = PF.categories.findByName(row.categoryNameSuggestion, kind) || PF.categories.add(row.categoryNameSuggestion, kind);
      return cat.id;
    }
    const learned = PF.payeeRules.lookup(row.payee);
    if (learned) return learned;
    return null;
  }

  // A row from a multi-card file (cardNameSuggestion set) is tagged with
  // whichever physical card it was really on - find-or-create a matching
  // PF.cards entry for it ("אני לא יודע לאיזה כרטיס זה שייך" never happens).
  // New cards default to "personal"; recategorize to joint in Settings if
  // it's actually the shared one.
  function resolveCard(row) {
    if (!row.cardNameSuggestion) return null;
    const card = PF.cards.findByName(row.cardNameSuggestion) || PF.cards.add(row.cardNameSuggestion, "personal");
    return card.id;
  }

  function renderBatches() {
    resultsRoot.innerHTML = "";
    batches.forEach((batch, idx) => resultsRoot.appendChild(batchCard(batch, idx)));
  }

  // Single-card-per-file profiles: one batch-level selector covers every row.
  const SINGLE_CARD_PROFILE_IDS = ["cal_card", "isracard_card"];
  // Multi-card-per-file profiles: each row already names its own card
  // (resolvedCardId, from cardNameSuggestion) - no batch-level selector needed.
  const MULTI_CARD_PROFILE_IDS = ["cal_all_cards"];

  function batchCard(batch, idx) {
    const isSingleCardFile = SINGLE_CARD_PROFILE_IDS.includes(batch.profileId);
    const header = h("div", { class: "row", style: "justify-content:space-between; align-items:center" }, [
      h("div", {}, [h("strong", {}, [batch.fileName]), h("div", { class: "pill" }, [batch.profileLabel])]),
      !batch.unrecognized ? h("div", { class: "row", style: "flex:0 0 auto; gap:10px" }, [
        h("div", { class: "field", style: "max-width:260px; margin:0" }, [
          h("label", {}, ["חשבון יעד"]),
          h("select", { onchange: e => { batch.accountId = e.target.value; } }, PF.ui.accountOptions(batch.accountId))
        ]),
        isSingleCardFile && PF.cards.all().length ? h("div", { class: "field", style: "max-width:220px; margin:0" }, [
          h("label", {}, ["כרטיס"]),
          h("select", { onchange: e => { batch.cardId = e.target.value || null; } }, [
            h("option", { value: "" }, ["ללא שיוך"]),
            ...PF.ui.cardOptions(batch.cardId)
          ])
        ]) : null
      ]) : null
    ]);

    if (batch.unrecognized) {
      return h("div", { class: "card" }, [header, h("p", { class: "empty-state" }, ["מבנה הקובץ לא מוכר. בקשו מיפוי ידני (פתח בקשה), או בדקו שזה קובץ כרטיס/בנק נתמך."])]);
    }

    const table = h("table", {}, [
      h("thead", {}, [h("tr", {}, ["", "תאריך", "תיאור", "סכום", "סוג", "קטגוריה / העברה", "כרטיס", ""].map(t => h("th", {}, [t])))]),
      h("tbody", {}, batch.rows.map(r => rowEl(r, batch)))
    ]);

    const dupCount = batch.rows.filter(r => r.isDuplicate).length;
    const suspectedCount = batch.rows.filter(r => r.isSuspectedDuplicate).length;
    const commitBtn = h("button", { class: "primary", onclick: () => commitBatch(batch, idx) }, [`ייבא ${batch.rows.filter(r => r.include).length} תנועות`]);

    return h("div", { class: "card" }, [
      header,
      dupCount ? h("p", {}, [h("span", { class: "badge" }, [`${dupCount} שורות זוהו כבר קיימות בנתונים ולא מסומנות`])]) : null,
      // Fuzzy match, not exact — e.g. the same purchase entered by hand
      // earlier with a slightly different description. Left INCLUDED by
      // default (unlike confirmed duplicates) since it's only a guess -
      // review the badge on each row and uncheck if it really is the same one.
      suspectedCount ? h("p", {}, [h("span", { class: "badge", style: "background:#fdeacb; color:#8a5a1a" }, [`${suspectedCount} שורות דומות לתנועות קיימות - בדקו לפני ייבוא`])]) : null,
      table,
      h("div", { style: "margin-top:10px" }, [commitBtn])
    ]);
  }

  function rowEl(r, batch) {
    const includeCb = h("input", { type: "checkbox", checked: r.include || false, onchange: e => { r.include = e.target.checked; } });
    const categoryCell = h("div", {});

    if (r.suggestTransfer) {
      // Known credit-card-company settlement line: by default we SKIP importing
      // it, on the assumption the underlying purchases were (or will be) imported
      // in detail from the card's own export — importing both would deduct the
      // bank balance correctly once either way, but double-count the expense in
      // the category dashboards. Unchecking "skip" turns it into a normal expense
      // for cases where you don't import that card's detail separately.
      includeCb.checked = false;
      r.include = false;
      const skipLabel = h("label", { style: "display:flex; align-items:center; gap:6px" }, [
        h("input", { type: "checkbox", checked: true, onchange: e => { r.skipAsSettlement = e.target.checked; r.include = !e.target.checked; includeCb.checked = r.include; renderCat(); } }),
        " דלג (כרטיס אשראי, יובא בנפרד)"
      ]);
      categoryCell.appendChild(skipLabel);
      r.skipAsSettlement = true;
    }
    if (r.suggestBitTransfer) {
      const linked = linkedAccountFor(r);
      const note = linked
        ? h("span", { class: "badge transfer" }, [`העברה מ-Bit → ${linked.name}`])
        : h("span", { class: "badge" }, ["העברה מ-Bit (אין חשבון מתאים - ייובא כרגיל)"]);
      categoryCell.appendChild(note);
    }
    if (r.suggestLoanPayment) {
      const loan = linkedLoanFor(r);
      const note = loan
        ? h("span", { class: "badge transfer" }, [`תשלום הלוואה → ${loan.name}`])
        : h("span", { class: "badge" }, ["תשלום הלוואה (אין הלוואה מתאימה - ייובא כהוצאה רגילה)"]);
      categoryCell.appendChild(note);
    }
    const catSlot = h("div", {});
    categoryCell.appendChild(catSlot);

    const cardCell = h("td", {});
    if (r.cardNameSuggestion) {
      const cardSelect = h("select", {}, PF.ui.cardOptions(r.resolvedCardId));
      cardSelect.addEventListener("change", () => { r.resolvedCardId = cardSelect.value; });
      cardCell.appendChild(cardSelect);
    } else {
      cardCell.textContent = "-";
    }

    const wrapper = h("tr", { class: (r.isDuplicate ? "is-duplicate " : "") + (r.suggestTransfer || r.suggestLoanPayment || r.suggestBitTransfer ? "is-transfer" : "") }, [
      h("td", {}, [includeCb]),
      h("td", {}, [r.date]),
      h("td", {}, [r.payee || "-"]),
      h("td", { class: "amount " + (r.type === "income" ? "income" : "expense") }, [money(r.amount)]),
      h("td", {}, [{ income: "הכנסה", expense: "הוצאה" }[r.type]]),
      h("td", {}, [categoryCell]),
      cardCell,
      h("td", {}, [
        r.isDuplicate ? h("span", { class: "badge" }, ["כפילות"])
          : r.isSuspectedDuplicate ? h("span", { class: "badge", style: "background:#fdeacb; color:#8a5a1a" }, ["דומה לקיימת?"])
          : null
      ])
    ]);

    renderCat();
    function renderCat() {
      catSlot.innerHTML = "";
      if (r.suggestTransfer && r.skipAsSettlement) return;
      // Loan/Bit transfers go straight to the linked account when one exists —
      // no category to pick. Only show a category picker as a fallback when
      // there's no matching account to transfer into (so the money isn't
      // silently dropped), or for ordinary rows.
      if (r.suggestBitTransfer && linkedAccountFor(r)) return;
      if (r.suggestLoanPayment && linkedLoanFor(r)) return;
      const kind = r.type === "income" ? "income" : "expense";
      const picker = PF.ui.categoryPicker(kind, r.resolvedCategoryId, val => { r.resolvedCategoryId = val || null; }, "לא מסווג");
      catSlot.appendChild(picker.el);
    }
    return wrapper;
  }

  function commitBatch(batch, idx) {
    const toCommit = batch.rows.filter(r => r.include && !(r.suggestTransfer && r.skipAsSettlement));
    const toAdd = toCommit.map(r => {
      const linked = r.suggestBitTransfer ? linkedAccountFor(r) : null;
      if (linked) {
        // Bit transfer: money moved FROM Bit INTO the bank account (income-type
        // row); Bit is a real tracked account, so this really is a transfer.
        const moneyLeavesBank = r.type === "expense";
        return {
          date: r.date, amount: r.amount, type: "transfer",
          fromAccountId: moneyLeavesBank ? batch.accountId : linked.id,
          toAccountId: moneyLeavesBank ? linked.id : batch.accountId,
          payee: r.payee, notes: r.notes, importHash: r.hash
        };
      }
      const loan = linkedLoanFor(r);
      const cardId = MULTI_CARD_PROFILE_IDS.includes(batch.profileId)
        ? (r.resolvedCardId || null)
        : (SINGLE_CARD_PROFILE_IDS.includes(batch.profileId) ? (batch.cardId || null) : null);
      return {
        date: r.date, amount: r.amount, type: r.type,
        accountId: batch.accountId, categoryId: r.resolvedCategoryId || null,
        loanId: loan ? loan.id : undefined,
        cardId,
        payee: r.payee, notes: r.notes, importHash: r.hash
      };
    });
    PF.transactions.addMany(toAdd);
    const skipped = batch.rows.filter(r => r.suggestTransfer && r.skipAsSettlement).length;
    PF.ui.toast(`יובאו ${toAdd.length} תנועות מ-${batch.fileName}` + (skipped ? ` (${skipped} דולגו - כרטיס אשראי)` : ""));
    batches.splice(idx, 1);
    // Local re-render only (not PF.app.render()): a full remount would throw
    // away any OTHER files still queued up and awaiting review in this batch.
    renderBatches();
  }
};
