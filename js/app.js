window.PF = window.PF || {};

PF.app = (function () {
  let currentRoute = "dashboard";

  function navigate(route) {
    currentRoute = route;
    document.querySelectorAll("#main-nav button").forEach(b => b.classList.toggle("active", b.dataset.route === route));
    render();
  }

  function render() {
    const root = document.getElementById("view");
    root.innerHTML = "";
    if (!PF.store.data) {
      PF.views.start(root);
      return;
    }
    const view = PF.views[currentRoute] || PF.views.dashboard;
    view(root);
  }

  function init() {
    document.querySelectorAll("#main-nav button").forEach(btn => {
      btn.addEventListener("click", () => navigate(btn.dataset.route));
    });
    // Deliberately no global store.onChange -> render() here: every view
    // triggers its own refresh after a mutation (full render(), or a local
    // DOM update when it holds state that must survive a mutation — e.g. the
    // import view's queue of not-yet-committed files). A blanket auto-render
    // on every store change would remount the current view and wipe that
    // kind of in-progress, not-yet-saved local state.

    PF.persistence.tryReopenLast().then(result => {
      render();
    });
  }

  return { navigate, render, init };
})();

document.addEventListener("DOMContentLoaded", PF.app.init);
