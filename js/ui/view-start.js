window.PF = window.PF || {};

PF.views = PF.views || {};

PF.views.start = function (root) {
  const { h } = PF.ui;
  const warn = PF.persistence.supportsFS ? null : h("p", { class: "empty-state" }, [
    "הדפדפן שלך לא תומך בשמירה ישירה לקובץ. ניתן לעבוד עם הדף ולהשתמש ב\"ייבוא/ייצוא קובץ\" כדי לשמור ולטעון נתונים."
  ]);

  const card = h("div", { class: "card" }, [
    h("h2", {}, ["ברוך הבא"]),
    h("p", {}, ["בחר קובץ JSON קיים לפתיחה, או צור קובץ נתונים חדש. מומלץ לבחור מיקום בתוך תיקייה המסונכרנת עם Google Drive כדי לשמור גיבוי בענן."]),
    warn,
    h("div", { class: "row" }, [
      h("button", { class: "primary", onclick: onCreate }, ["צור קובץ נתונים חדש"]),
      PF.persistence.supportsFS ? h("button", { class: "ghost", onclick: onOpen }, ["פתח קובץ קיים"]) : null,
      !PF.persistence.supportsFS ? h("label", { class: "ghost", style: "cursor:pointer" }, [
        "טען קובץ (fallback)",
        h("input", { type: "file", accept: "application/json", style: "display:none", onchange: onUpload })
      ]) : null
    ])
  ]);
  root.appendChild(card);

  async function onCreate() {
    try {
      await PF.persistence.createNew();
      PF.ui.toast("נוצר קובץ נתונים חדש");
      PF.app.navigate("dashboard");
    } catch (e) { if (e.name !== "AbortError") PF.ui.toast("שגיאה: " + e.message); }
  }

  async function onOpen() {
    try {
      await PF.persistence.openExisting();
      PF.ui.toast("הקובץ נטען בהצלחה");
      PF.app.navigate("dashboard");
    } catch (e) { if (e.name !== "AbortError") PF.ui.toast("שגיאה: " + e.message); }
  }

  function onUpload(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    PF.persistence.uploadJson(file).then(() => {
      PF.ui.toast("הקובץ נטען בהצלחה");
      PF.app.navigate("dashboard");
    });
  }
};
