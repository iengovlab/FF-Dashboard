/* Tabs and sub-tabs of the dashboard.
   To add a tab: add an entry to TABS, a <main class="page" data-page="<id>" hidden> block in index.html,
   and its code in tabs/<id>.js. A tab with sub-tabs lists them in `subs`; each sub-tab's block then uses
   data-page="<tab id>/<sub id>". The sub-tab bar only shows for tabs that have sub-tabs.
   The address bar keeps the open page (#<tab id> or #<tab id>/<sub id>), so links go straight to it.
   When a page is shown, a "tabshown" event fires on document with the page id. Each tab loads its data
   the first time it is shown, so only the tabs someone opens download anything. */
(function () {
  "use strict";
  const TABS = [
    { id: "river-monitors", title: "River Monitors", subs: [] },
    // example with sub-tabs: { id: "firms", title: "Firms", subs: [{ id: "survey", title: "Survey" }, { id: "map", title: "Map" }] },
  ];
  const $ = (id) => document.getElementById(id);
  const link = (href, title) => `<a href="#${href}">${title}</a>`;

  function show() {
    const [t, s] = decodeURIComponent(location.hash.slice(1)).split("/");
    const tab = TABS.find((x) => x.id === t) || TABS[0];
    const sub = tab.subs.length ? tab.subs.find((x) => x.id === s) || tab.subs[0] : null;
    const page = sub ? tab.id + "/" + sub.id : tab.id;

    $("tabbar").innerHTML = TABS.map((x) => link(x.id, x.title)).join("");
    $("subtabbar").innerHTML = tab.subs.map((x) => link(tab.id + "/" + x.id, x.title)).join("");
    $("subtabbar").hidden = !tab.subs.length;
    for (const a of document.querySelectorAll(".tabbar a")) {
      const h = a.getAttribute("href").slice(1);
      if (h === tab.id || h === page) a.setAttribute("aria-current", "page");
    }
    for (const p of document.querySelectorAll(".page")) p.hidden = p.dataset.page !== page;
    document.title = (sub ? sub.title + " · " : "") + tab.title + " · IEN Floods-Firms Dashboard";
    document.dispatchEvent(new CustomEvent("tabshown", { detail: page }));
  }
  window.addEventListener("hashchange", show);
  // first show after every tab script has run, so their "tabshown" listeners are in place
  document.addEventListener("DOMContentLoaded", show);
})();
