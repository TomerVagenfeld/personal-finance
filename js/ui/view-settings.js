window.PF = window.PF || {};
PF.views = PF.views || {};

PF.views.settings = function (root) {
  const { h } = PF.ui;

  root.appendChild(fileCard());
  root.appendChild(categoryCard("income", "קטגוריות הכנסה"));
  root.appendChild(categoryCard("expense", "קטגוריות הוצאה"));
  root.appendChild(cardsCard());

  function fileCard() {
    const status = PF.persistence.hasHandle()
      ? "הקובץ נשמר אוטומטית לדיסק בכל שינוי."
      : "אין קובץ מקושר לשמירה ישירה - השתמש בהורדה/העלאה כדי לגבות ולשחזר נתונים.";
    return h("div", { class: "card" }, [
      h("h2", {}, ["קובץ נתונים"]),
      h("p", {}, [status]),
      h("div", { class: "row" }, [
        h("button", { class: "ghost", onclick: () => PF.persistence.downloadJson() }, ["הורד קובץ JSON"]),
        h("label", { class: "ghost", style: "text-align:center; cursor:pointer" }, [
          "העלה קובץ JSON",
          h("input", { type: "file", accept: "application/json", style: "display:none", onchange: uploadFile })
        ]),
        PF.persistence.supportsFS ? h("button", { class: "ghost", onclick: openOther }, ["פתח קובץ אחר"]) : null
      ])
    ]);
  }

  function uploadFile(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    PF.persistence.uploadJson(file).then(() => { PF.ui.toast("הקובץ נטען"); PF.app.render(); });
  }

  async function openOther() {
    try {
      await PF.persistence.openExisting();
      PF.ui.toast("הקובץ נטען");
      PF.app.render();
    } catch (e) { if (e.name !== "AbortError") PF.ui.toast(e.message); }
  }

  function categoryCard(kind, title) {
    const nameInput = h("input", { type: "text", placeholder: "קטגוריה חדשה" });
    const list = h("div", {});
    renderList();
    const card = h("div", { class: "card" }, [
      h("h3", {}, [title]),
      list,
      h("div", { class: "row", style: "margin-top:10px" }, [
        nameInput,
        h("button", { class: "small primary", onclick: add }, ["הוסף"])
      ])
    ]);
    return card;

    function renderList() {
      list.innerHTML = "";
      PF.categories.all(kind).forEach(c => {
        list.appendChild(h("div", { class: "row", style: "align-items:center; margin-bottom:6px" }, [
          h("span", { style: "flex:1" }, [c.name]),
          h("button", { class: "small", onclick: () => remove(c.id) }, ["מחק"])
        ]));
      });
    }

    function add() {
      if (!nameInput.value.trim()) return;
      PF.categories.add(nameInput.value.trim(), kind);
      nameInput.value = "";
      renderList();
      PF.ui.toast("הקטגוריה נוספה");
    }

    function remove(id) {
      try {
        PF.categories.remove(id);
        renderList();
        PF.ui.toast("הקטגוריה נמחקה");
      } catch (e) { PF.ui.toast(e.message); }
    }
  }

  function cardsCard() {
    const nameInput = h("input", { type: "text", placeholder: "שם הכרטיס (לדוגמה: ויזה פלטינום 7745)" });
    const typeSelect = h("select", {}, Object.entries(PF.CARD_TYPES).map(([val, label]) => h("option", { value: val }, [label])));
    const list = h("div", {});
    renderList();
    const card = h("div", { class: "card" }, [
      h("h3", {}, ["כרטיסי אשראי"]),
      h("p", {}, ["כרטיס הוא רק תיוג לסינון - החיוב עצמו עדיין יורד מחשבון הבנק כרגיל, כמו תמיד."]),
      list,
      h("div", { class: "row", style: "margin-top:10px" }, [
        nameInput, typeSelect,
        h("button", { class: "small primary", onclick: add }, ["הוסף"])
      ])
    ]);
    return card;

    function renderList() {
      list.innerHTML = "";
      PF.cards.all().forEach(c => {
        list.appendChild(h("div", { class: "row", style: "align-items:center; margin-bottom:6px" }, [
          h("span", { style: "flex:1" }, [c.name]),
          h("span", { class: "pill" }, [PF.CARD_TYPES[c.type]]),
          h("button", { class: "small", onclick: () => remove(c.id) }, ["מחק"])
        ]));
      });
      if (!PF.cards.all().length) list.appendChild(h("p", { class: "empty-state" }, ["אין עדיין כרטיסים."]));
    }

    function add() {
      if (!nameInput.value.trim()) return;
      PF.cards.add(nameInput.value.trim(), typeSelect.value);
      nameInput.value = "";
      renderList();
      PF.ui.toast("הכרטיס נוסף");
    }

    function remove(id) {
      try {
        PF.cards.remove(id);
        renderList();
        PF.ui.toast("הכרטיס נמחק");
      } catch (e) { PF.ui.toast(e.message); }
    }
  }
};
