/* Light / dark theme toggle in the header. The choice is kept in this browser (localStorage "ien-theme");
   without a choice the page follows the system setting. The <head> script applies a saved choice before the page draws. */
(function () {
  "use strict";
  const root = document.documentElement, btn = document.getElementById("themeToggle");
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches);
  const label = () => { btn.textContent = isDark() ? "Light theme" : "Dark theme"; btn.setAttribute("aria-pressed", String(isDark())); };
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("ien-theme", next); } catch (e) { /* private mode: the choice lasts until reload */ }
    label();
  });
  sysDark.addEventListener("change", label);
  label();
})();
