window.PF = window.PF || {};

PF.ui = (function () {
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    (children || []).forEach(c => {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  function money(n) {
    const sign = n < 0 ? "-" : "";
    return sign + "₪" + Math.abs(n).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayStr() {
    return PF.todayStr();
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function accountOptions(selectedId) {
    return PF.accounts.all().map(a =>
      h("option", { value: a.id, selected: a.id === selectedId || false }, [`${a.name} (${PF.ACCOUNT_TYPES[a.type]})`])
    );
  }

  function categoryOptions(kind, selectedId) {
    return PF.categories.all(kind).map(c =>
      h("option", { value: c.id, selected: c.id === selectedId || false }, [c.name])
    );
  }

  function cardOptions(selectedId) {
    return PF.cards.all().map(c =>
      h("option", { value: c.id, selected: c.id === selectedId || false }, [`${c.name} (${PF.CARD_TYPES[c.type]})`])
    );
  }

  // A category <select> with "+ קטגוריה חדשה..." built in, so you're never
  // blocked on a category that doesn't exist yet in whatever form you're
  // filling - income or expense, anywhere a category gets assigned.
  // Returns { el, getValue(), setKind(kind, selectedId) } rather than a bare
  // <select>, since picking "new" swaps in a text input in its place.
  function categoryPicker(kind, selectedId, onChange, blankLabel) {
    const NEW_VALUE = "__new__";
    let currentKind = kind;
    const select = h("select", {});
    const newInput = h("input", { type: "text", placeholder: "שם הקטגוריה החדשה - Enter לאישור", style: "display:none; margin-top:4px; width:100%" });
    const wrap = h("div", {}, [select, newInput]);

    function fillOptions(selId) {
      select.innerHTML = "";
      if (blankLabel) select.appendChild(h("option", { value: "", selected: !selId }, [blankLabel]));
      categoryOptions(currentKind, selId).forEach(o => select.appendChild(o));
      select.appendChild(h("option", { value: NEW_VALUE }, ["+ קטגוריה חדשה..."]));
    }
    fillOptions(selectedId);

    select.addEventListener("change", () => {
      if (select.value === NEW_VALUE) {
        newInput.style.display = "";
        newInput.value = "";
        newInput.focus();
      } else {
        newInput.style.display = "none";
        if (onChange) onChange(select.value);
      }
    });
    function commitNew() {
      const name = newInput.value.trim();
      newInput.style.display = "none";
      if (!name) { fillOptions(select.dataset.lastValue || ""); return; }
      const cat = PF.categories.add(name, currentKind);
      fillOptions(cat.id);
      if (onChange) onChange(cat.id);
    }
    newInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commitNew(); } });
    newInput.addEventListener("blur", commitNew);

    return {
      el: wrap,
      getValue() { return select.value === NEW_VALUE ? "" : select.value; },
      setKind(newKind, selId) { currentKind = newKind; newInput.style.display = "none"; fillOptions(selId); }
    };
  }

  // A plain object backed by localStorage under `key`, seeded from
  // `defaults` then overwritten by whatever was saved last time (browser-only
  // UI state - which filters/sort/grouping you last had open - never written
  // into the real data file). Call .save() after changing .state; call it
  // from one choke point (e.g. the top of your render function) rather than
  // after every single input, so nothing is missed.
  function persistentObject(key, defaults) {
    const state = { ...defaults };
    try {
      const raw = localStorage.getItem(key);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (e) { /* private browsing etc. — just use defaults */ }
    function save() {
      try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }
    return { state, save };
  }

  return { h, money, todayStr, toast, accountOptions, categoryOptions, cardOptions, categoryPicker, persistentObject };
})();
