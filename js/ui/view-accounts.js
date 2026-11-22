window.PF = window.PF || {};
PF.views = PF.views || {};

PF.views.accounts = function (root) {
  const { h, money } = PF.ui;

  const list = h("div", { class: "grid cols-2" });
  PF.accounts.all().forEach(acc => list.appendChild(accountCard(acc)));
  root.appendChild(h("div", { class: "card" }, [h("h2", {}, ["חשבונות"]), list]));

  root.appendChild(addAccountForm());

  // --- Loans ------------------------------------------------------------
  // A loan isn't an account — it never holds money you can spend from — so
  // it gets its own section here instead of showing up in the grid above.
  const loanList = h("div", { class: "grid cols-2" });
  PF.loans.all().forEach(loan => loanList.appendChild(loanCard(loan)));
  root.appendChild(h("div", { class: "card" }, [
    h("h2", {}, ["הלוואות"]),
    PF.loans.all().length ? loanList : h("p", { class: "empty-state" }, ["אין עדיין הלוואות."])
  ]));
  root.appendChild(addLoanForm());

  function accountCard(acc) {
    const balance = PF.accounts.balance(acc.id);
    const newBalanceInput = h("input", { type: "number", step: "0.01", placeholder: "יתרה בפועל" });
    const isShared = acc.type === "shared_bank";
    const transferredIn = isShared ? PF.accounts.transfersIn(acc.id) : 0;
    const otherGap = isShared ? Math.round((balance - transferredIn) * 100) / 100 : 0;
    return h("div", { class: "card" }, [
      h("div", { class: "row", style: "justify-content:space-between" }, [
        h("div", {}, [
          h("strong", {}, [acc.name]),
          h("div", { class: "pill" }, [PF.ACCOUNT_TYPES[acc.type]])
        ]),
        h("button", { class: "small", onclick: () => removeAccount(acc.id) }, ["מחק"])
      ]),
      h("div", { class: "stat", style: "margin:10px 0" }, [
        h("span", { class: "label" }, ["יתרה נוכחית (מחושבת)"]),
        h("span", { class: "value " + (balance >= 0 ? "positive" : "negative") }, [money(balance)])
      ]),
      isShared ? h("div", { class: "row" }, [
        h("div", { class: "stat" }, [
          h("span", { class: "label" }, ["מזה, הועברתי על ידי"]),
          h("span", { class: "value" }, [money(transferredIn)])
        ]),
        h("div", { class: "stat" }, [
          h("span", { class: "label" }, ["יתרת בן/בת הזוג + הוצאות משותפות (לא מפורט)"]),
          h("span", { class: "value " + (otherGap >= 0 ? "positive" : "negative") }, [money(otherGap)])
        ])
      ]) : null,
      isShared ? h("p", { class: "empty-state" }, ["עדכון יתרה כאן לא אומר \"מזומן ששכחתי\" כמו בחשבונות שלכם - כל מה שהעברתם לכאן כבר נרשם כהעברה, אז כל פער הוא כנראה כסף מבן/בת הזוג או הוצאה משותפת שעוד לא נרשמה."]) : null,
      h("div", { class: "row" }, [
        newBalanceInput,
        h("button", { class: "small primary", onclick: () => reconcile(acc.id, newBalanceInput) }, ["עדכן יתרה"])
      ])
    ]);
  }

  function reconcile(accountId, input) {
    const val = Number(input.value);
    if (isNaN(val) || input.value === "") { PF.ui.toast("יש להזין יתרה"); return; }
    const txn = PF.accounts.adjustBalanceTo(accountId, val);
    PF.ui.toast(txn ? "היתרה עודכנה" : "היתרה כבר מדויקת");
    PF.app.render();
  }

  function removeAccount(id) {
    try {
      PF.accounts.remove(id);
      PF.ui.toast("החשבון נמחק");
      PF.app.render();
    } catch (e) { PF.ui.toast(e.message); }
  }

  function loanCard(loan) {
    const remaining = PF.loans.remaining(loan.id);
    const newRemainingInput = h("input", { type: "number", step: "0.01", placeholder: "יתרה שנותרה לתשלום" });
    return h("div", { class: "card" }, [
      h("div", { class: "row", style: "justify-content:space-between" }, [
        h("div", {}, [
          h("strong", {}, [loan.name]),
          h("div", { class: "pill" }, ["הלוואה"])
        ]),
        h("button", { class: "small", onclick: () => removeLoan(loan.id) }, ["מחק"])
      ]),
      h("div", { class: "stat", style: "margin:10px 0" }, [
        h("span", { class: "label" }, ["יתרה שנותרה לתשלום (מחושבת)"]),
        h("span", { class: "value negative" }, [money(remaining)])
      ]),
      h("div", { class: "row" }, [
        newRemainingInput,
        h("button", { class: "small primary", onclick: () => reconcileLoan(loan.id, newRemainingInput) }, ["עדכן יתרה"])
      ])
    ]);
  }

  function reconcileLoan(loanId, input) {
    if (input.value === "") { PF.ui.toast("יש להזין יתרה"); return; }
    const val = -Math.abs(Number(input.value)); // always store as debt (negative)
    const txn = PF.loans.adjustTo(loanId, val);
    PF.ui.toast(txn ? "היתרה עודכנה" : "היתרה כבר מדויקת");
    PF.app.render();
  }

  function removeLoan(id) {
    try {
      PF.loans.remove(id);
      PF.ui.toast("ההלוואה נמחקה");
      PF.app.render();
    } catch (e) { PF.ui.toast(e.message); }
  }

  function addLoanForm() {
    const nameInput = h("input", { type: "text", placeholder: "שם ההלוואה" });
    const openingInput = h("input", { type: "number", step: "0.01", placeholder: "סכום שנותר לתשלום כרגע", value: "0" });
    const openingDateInput = h("input", { type: "date", value: PF.ui.todayStr() });

    return h("div", { class: "card" }, [
      h("h3", {}, ["הוספת הלוואה"]),
      h("div", { class: "row" }, [
        field("שם", nameInput), field("יתרה נוכחית", openingInput)
      ]),
      h("div", { class: "row" }, [field("נכון לתאריך", openingDateInput)]),
      h("button", { class: "primary", onclick: submit }, ["הוסף הלוואה"])
    ]);

    function field(label, input) {
      return h("div", { class: "field" }, [h("label", {}, [label]), input]);
    }

    function submit() {
      if (!nameInput.value.trim()) { PF.ui.toast("יש להזין שם"); return; }
      PF.loans.add({
        name: nameInput.value.trim(),
        openingBalance: -Math.abs(Number(openingInput.value) || 0),
        openingDate: openingDateInput.value || PF.ui.todayStr()
      });
      PF.ui.toast("ההלוואה נוספה");
      PF.app.render();
    }
  }

  function addAccountForm() {
    const nameInput = h("input", { type: "text", placeholder: "שם החשבון" });
    const typeSelect = h("select", {}, Object.entries(PF.ACCOUNT_TYPES).map(([val, label]) => h("option", { value: val }, [label])));
    const openingInput = h("input", { type: "number", step: "0.01", value: "0" });
    const openingDateInput = h("input", { type: "date", value: PF.ui.todayStr() });

    return h("div", { class: "card" }, [
      h("h3", {}, ["הוספת חשבון"]),
      h("div", { class: "row" }, [
        field("שם", nameInput), field("סוג", typeSelect)
      ]),
      h("div", { class: "row" }, [
        field("יתרת פתיחה", openingInput), field("תאריך פתיחה", openingDateInput)
      ]),
      h("button", { class: "primary", onclick: submit }, ["הוסף חשבון"])
    ]);

    function field(label, input) {
      return h("div", { class: "field" }, [h("label", {}, [label]), input]);
    }

    function submit() {
      if (!nameInput.value.trim()) { PF.ui.toast("יש להזין שם"); return; }
      PF.accounts.add({
        name: nameInput.value.trim(),
        type: typeSelect.value,
        openingBalance: Number(openingInput.value) || 0,
        openingDate: openingDateInput.value || PF.ui.todayStr()
      });
      PF.ui.toast("החשבון נוסף");
      PF.app.render();
    }
  }
};
