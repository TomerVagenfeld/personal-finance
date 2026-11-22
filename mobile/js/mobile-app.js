window.PF = window.PF || {};

PF.mobileApp = (function () {
  const { h, money, toast } = PF.ui;
  const root = document.getElementById("app");

  function render() {
    root.innerHTML = "";
    if (!PF.mobileSetup.isConfigured()) {
      root.appendChild(setupScreen());
    } else {
      root.appendChild(quickAddScreen());
    }
  }

  // --- One-time setup screen ------------------------------------------------
  function setupScreen() {
    const cfg = PF.mobileSetup.getConfig();
    const clientIdInput = h("input", { type: "text", placeholder: "Client ID (מסתיים ב-.apps.googleusercontent.com)", value: cfg.googleClientId || PF.mobileSetup.GOOGLE_CLIENT_ID || "" });
    const apiKeyInput = h("input", { type: "text", placeholder: "API Key", value: cfg.googleApiKey || PF.mobileSetup.GOOGLE_API_KEY || "" });
    const statusEl = h("p", { class: "status-banner", style: "display:none" });
    const connectBtn = h("button", { class: "primary", onclick: connect }, ["התחבר ובחר קובץ"]);

    // A bare pasted file id/link is NOT enough — the `drive.file` scope only
    // covers files the app created, or one the user explicitly selected
    // through Google's own Picker (confirmed: a pasted id 404s even for a
    // file the user owns). So this flow gets the token, THEN opens the
    // Picker so the user clicks their real personal-finance.json — that
    // click itself is what grants access, not just records an id.
    async function connect() {
      const clientId = clientIdInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      if (!clientId) { showStatus("יש להזין Client ID", "error"); return; }
      if (!apiKey) { showStatus("יש להזין API Key", "error"); return; }

      PF.mobileSetup.saveConfig({ googleClientId: clientId, googleApiKey: apiKey });
      showStatus("מתחבר ל-Google...", "syncing");
      try {
        const token = await PF.driveAuth.getToken({ interactive: true, clientId });
        if (!token) { showStatus("ההתחברות נכשלה", "error"); return; }

        showStatus("בחרו את קובץ personal-finance.json...", "syncing");
        const fileId = await PF.drivePicker.pickFile({ token, apiKey, clientId });
        if (!fileId) { showStatus("לא נבחר קובץ", "error"); return; }

        showStatus("בודק גישה לקובץ...", "syncing");
        const probe = await PF.driveApi.probeFile(fileId, token);
        if (!probe.ok) {
          showStatus(`לא ניתן לגשת לקובץ (${probe.status || ""}) גם אחרי הבחירה - נסו שוב.`, "error");
          return;
        }
        PF.mobileSetup.saveConfig({ driveFileId: fileId });
        showStatus("מחובר! מסנכרן נתונים ראשוניים...", "syncing");
        await PF.sync.run({ interactive: true });
        render();
      } catch (e) {
        showStatus("שגיאה: " + (e && e.message || e), "error");
      }
    }

    function showStatus(msg, kind) {
      statusEl.textContent = msg;
      statusEl.className = "status-banner " + kind;
      statusEl.style.display = "";
    }

    return h("div", {}, [
      h("div", { class: "card" }, [
        h("h1", {}, ["חיבור ל-Google Drive"]),
        h("p", { style: "font-size:13px; color:var(--muted)" }, [
          "חד-פעמי: הדביקו את ה-Client ID וה-API Key שיצרתם ב-Google Cloud Console, לחצו \"התחבר ובחר קובץ\", והתחברו דרך החלון של Google. ייפתח חלון בחירה של Drive - בחרו בו את personal-finance.json."
        ]),
        h("div", { class: "field" }, [h("label", {}, ["Google OAuth Client ID"]), clientIdInput]),
        h("div", { class: "field" }, [h("label", {}, ["Google API Key"]), apiKeyInput]),
        statusEl,
        connectBtn
      ])
    ]);
  }

  // --- Quick-add screen ------------------------------------------------------
  function quickAddScreen() {
    PF.store.data = PF.localMirror.toStoreData();
    const mirror = PF.localMirror.get();

    const container = h("div", {});
    const statusEl = h("p", { class: "status-banner", style: "display:none" });
    const queueBadge = h("span", { class: "queue-badge", style: "display:none" });

    PF.sync.onStatusChange(status => renderStatus(status));
    renderStatus(PF.sync.getStatus());
    refreshQueueBadge();

    const typeState = { value: "expense" };
    const incomeBtn = h("button", { class: "income" }, ["הכנסה"]);
    const expenseBtn = h("button", { class: "expense active" }, ["הוצאה"]);
    incomeBtn.addEventListener("click", () => setType("income"));
    expenseBtn.addEventListener("click", () => setType("expense"));
    function setType(t) {
      typeState.value = t;
      incomeBtn.classList.toggle("active", t === "income");
      expenseBtn.classList.toggle("active", t === "expense");
      categoryPicker.setKind(t, "");
    }

    const dateInput = h("input", { type: "date", value: PF.ui.todayStr() });
    const amountInput = h("input", { type: "number", step: "0.01", placeholder: "0.00" });
    const payeeInput = h("input", { type: "text", placeholder: "תיאור / בית עסק" });
    const accountSelect = h("select", {}, PF.ui.accountOptions());
    const categoryPicker = PF.ui.categoryPicker("expense", null, () => {}, "ללא קטגוריה");
    const cards = PF.cards.all();
    const cardSelect = cards.length ? h("select", {}, [h("option", { value: "" }, ["ללא כרטיס"]), ...PF.ui.cardOptions()]) : null;

    const submitBtn = h("button", { class: "primary", onclick: submit }, ["שמור"]);
    const syncBtn = h("button", { class: "ghost", onclick: () => PF.sync.run({ interactive: true }) }, ["סנכרן עכשיו", queueBadge]);
    const settingsLink = h("button", { class: "ghost", onclick: resetSetup }, ["שינוי חיבור ל-Drive"]);

    function resetSetup() {
      PF.mobileSetup.saveConfig({ driveFileId: null });
      render();
    }

    async function submit() {
      const amount = Number(amountInput.value);
      if (!amount || amount <= 0) { toast("יש להזין סכום"); return; }
      const accountId = accountSelect.value;
      if (!accountId) { toast("אין חשבונות זמינים - יש לסנכרן קודם"); return; }

      const chosenCatId = categoryPicker.getValue();
      const chosenCat = chosenCatId ? PF.categories.byId(chosenCatId) : null;

      await PF.pendingQueue.add({
        date: dateInput.value || PF.ui.todayStr(),
        amount,
        type: typeState.value,
        payee: payeeInput.value.trim(),
        accountId,
        // Stored by name/kind (not the possibly-offline-only id) so a
        // brand-new category typed in while offline resolves correctly
        // once a real sync runs against the fresh data — see sync.js.
        categoryName: chosenCat ? chosenCat.name : null,
        categoryKind: chosenCat ? chosenCat.kind : null,
        cardId: cardSelect ? (cardSelect.value || null) : null
      });

      toast("נשמר - ימתין לסנכרון");
      amountInput.value = "";
      payeeInput.value = "";
      dateInput.value = PF.ui.todayStr();
      refreshQueueBadge();
      PF.sync.run({ interactive: false });
    }

    async function refreshQueueBadge() {
      const n = await PF.pendingQueue.count();
      queueBadge.textContent = n;
      queueBadge.style.display = n ? "" : "none";
    }

    function renderStatus(status) {
      if (!status || status.state === "idle") { statusEl.style.display = "none"; return; }
      const labels = {
        syncing: "syncing", error: "error", done: "done",
        needs_tap: "needs_tap", needs_setup: "needs_tap"
      };
      statusEl.className = "status-banner " + (labels[status.state] || "syncing");
      statusEl.textContent = status.message || (status.state === "syncing" ? "מסנכרן..." : "");
      statusEl.style.display = "";
      refreshQueueBadge();
    }

    container.appendChild(h("h1", {}, ["הוספת תנועה מהירה"]));
    container.appendChild(statusEl);
    container.appendChild(h("div", { class: "card" }, [
      h("div", { class: "type-toggle" }, [expenseBtn, incomeBtn]),
      h("div", { class: "field" }, [h("label", {}, ["תאריך"]), dateInput]),
      h("div", { class: "field" }, [h("label", {}, ["סכום"]), amountInput]),
      h("div", { class: "field" }, [h("label", {}, ["תיאור"]), payeeInput]),
      h("div", { class: "field" }, [h("label", {}, ["חשבון"]), accountSelect]),
      h("div", { class: "field" }, [h("label", {}, ["קטגוריה"]), categoryPicker.el]),
      cardSelect ? h("div", { class: "field" }, [h("label", {}, ["כרטיס"]), cardSelect]) : null,
      submitBtn
    ]));
    container.appendChild(h("div", { class: "card" }, [
      syncBtn,
      mirror && mirror.syncedAt ? h("p", { style: "font-size:12px; color:var(--muted); text-align:center; margin:8px 0 0" }, [
        "סונכרן לאחרונה: " + new Date(mirror.syncedAt).toLocaleString("he-IL")
      ]) : null,
      settingsLink
    ]));

    return container;
  }

  function init() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    render();
    window.addEventListener("online", () => PF.sync.run({ interactive: false }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) PF.sync.run({ interactive: false });
    });
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", PF.mobileApp.init);
