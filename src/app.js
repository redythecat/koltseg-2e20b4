import { load, save, downloadBackup, readBackupFile, maybeAutoBackup, listBackups, shareOrDownloadBackup, addSnapshot, pruneOldBackups } from "./storage.js";
import { applyTheme, watchSystemTheme, applyAccent, applyFontScale } from "./theme.js";
import {
  addItem, updateItem, moveItem, deleteItem,
  addCategory, renameCategory, deleteCategory,
  addTransfer, updateTransfer, deleteTransfer,
  addReminder, updateReminder, deleteReminder, toggleReminderPaid, remindersDueOn, daysBetween,
  setCategoryBudget, reorderCategories, deleteItemTemplate, updateItemTemplate, todayKey,
  deleteTransferTemplate, updateTransferTemplate, emptyFilters, filterRange, hasActiveFilters,
} from "./model.js";
import { decodeImport } from "./codec.js";
import { downloadXlsx, expenseRows, transferRows } from "./xlsx.js";
import { reminderToIcs, reminderToGoogleUrl } from "./ics.js";
import { toast, confirmModal, choiceModal, changelogModal, helpModal, formModal, panelModal } from "./dialog.js";
import { CHANGELOG, APP_VERSION } from "./version.js";
import {
  el, shiftMonth, findCategoryIdByName,
  renderMonthView, renderItemForm, renderCategoryManager,
  renderTransfersView, renderTransferForm, renderOverview,
  renderImportView, renderRemindersView, renderReminderForm, renderSettings, renderRestoreView,
  renderTemplatesManager, renderTemplateForm, renderTransferTemplateForm, renderFilterPanel,
} from "./ui.js";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildImportPrompt() {
  const cats = state.db.categories.slice().sort((a, b) => a.order - b.order).map(c => c.name);
  const first = cats[0] || "Egyéb";
  return `Ez egy blokk fotója a "Költség" nevű költségkövető appomhoz. Olvasd ki a tételeket, és add vissza egy JSON-t pontosan ebben a formátumban:
{"month":"YYYY-MM","items":[{"name":"Tejföl","qty":2,"price":780,"store":"Lidl","date":"YYYY-MM-DD","payment":"card","category":"${first}"}]}
Szabályok:
- price = az adott sor teljes összege forintban, egész szám (nem egységár). qty = darabszám (ha nincs, 1).
- payment: kártya = "card", készpénz = "cash" (a blokkon általában rajta van).
- category CSAK ezek egyike legyen, pontosan így írva: ${cats.map(c => `"${c}"`).join(", ")}. Sorold mindegyik tételt a legmegfelelőbbe; ha egyik sem illik, válaszd a hozzá legközelebbit.
- month és date a blokkról; ha a hónap nem derül ki, a mostani hónap.
- NAGYON FONTOS: a válaszod KIZÁRÓLAG maga a JSON legyen — semmi bevezető vagy magyarázó szöveg, semmi kódblokk-jelölés, csak a nyers JSON egyetlen sorban.
Csatolom a blokk fotóját.`;
}

const state = {
  db: load(),
  month: currentMonthKey(),
  view: "month",
  editing: null,        // { type: "item"|"transfer"|"reminder", id, dir? }
  importCode: "",
  importPreview: null,
  navHidden: false,
  search: "",
  tplSearch: "",
  transferSearch: "",
  monthTotalOpen: false,
  filters: emptyFilters(),   // szándékosan NEM mentjük: appindításnál mindig üres
  filterOpen: {},            // melyik szűrő-szakasz van lenyitva a panelben
  filterTotalMode: "filtered",
};

applyTheme(state.db.settings.theme);
applyAccent(state.db.settings.accent);
applyFontScale(state.db.settings.fontScale);
watchSystemTheme(() => state.db.settings.theme);
const didAutoBackup = maybeAutoBackup(state.db);

function commit() {
  try { save(state.db); }
  catch (e) { toast(e.message || "Nem sikerült menteni (megtelt a tárhely?)."); }
  render();
}

// iPhone/iPad: telepített appban a csendes fájl-letöltés megbízhatatlan — ott a
// rendszer megosztó-lapját használjuk, és a mentésre előbb rákérdezünk.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// Szöveg letöltése fájlként (pl. .ics a naptárhoz). A blob-URL-t késleltetve
// szabadítjuk fel, mert azonnali visszavonásnál egyes telefonokon elveszik a letöltés.
function downloadText(name, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// --- Tétel ---
function saveItem(f) {
  const price = Math.round(f.price); // egész forint
  const cur = state.editing.id;
  if (cur == null) addItem(state.db, state.month, { ...f, price });
  else {
    updateItem(state.db, state.month, cur, { name: f.name, qty: f.qty, price, store: f.store, date: f.date, payment: f.payment });
    moveItem(state.db, state.month, cur, f.categoryId);
  }
  state.editing = null; commit();
}
async function removeItem(id) {
  if (!(await confirmModal("Biztosan törlöd ezt a tételt?", { okText: "Törlés", cancelText: "Mégse", danger: true }))) return;
  deleteItem(state.db, state.month, id); state.editing = null; commit();
}

// --- Utalás ---
function saveTransfer(f) {
  const cur = state.editing.id;
  if (cur == null) addTransfer(state.db, state.month, f);
  else updateTransfer(state.db, state.month, cur, { name: f.name, amount: f.amount, date: f.date, partner: f.partner, note: f.note, method: f.method, kind: f.kind, flow: f.flow, mandatory: f.mandatory });
  state.editing = null; commit();
}
async function removeTransfer(id) {
  if (!(await confirmModal("Biztosan törlöd ezt a pénzmozgást?", { okText: "Törlés", cancelText: "Mégse", danger: true }))) return;
  deleteTransfer(state.db, state.month, id); state.editing = null; commit();
}

// --- Kategória ---
async function onDeleteCategory(c) {
  if (state.db.categories.length <= 1) { toast("Legalább egy kategória kell."); return; }
  const others = state.db.categories.filter(x => x.id !== c.id);
  // 1. lépés: mi legyen a tételekkel? (a kategória-lista csak a 2. lépésben jön elő)
  const what = await choiceModal(`"${c.name}" törlése. Mi legyen a benne lévő tételekkel?`, [
    { label: "Áthelyezés másik kategóriába", value: "__move__" },
    { label: "Tételek törlése is", value: "__delete__", danger: true },
  ]);
  if (what === null) return;
  let target = null;
  if (what === "__move__") {
    target = await choiceModal("Melyik kategóriába kerüljenek?", others.map(x => ({ label: x.name, value: x.id })));
    if (target === null) return;
  }
  deleteCategory(state.db, c.id, target);
  commit();
}

// --- Emlékeztető ---
function saveReminder(f) {
  const cur = state.editing.id;
  if (cur == null) addReminder(state.db, f);
  else updateReminder(state.db, cur, f);
  state.editing = null; commit();
}
async function removeReminder(id) {
  if (!(await confirmModal("Biztosan törlöd ezt az emlékeztetőt?", { okText: "Törlés", cancelText: "Mégse", danger: true }))) return;
  deleteReminder(state.db, id); state.editing = null; commit();
}

// --- Elmentett tétel (sablon) — kis űrlapok, felugró ablakban ---
async function removeTemplate(t) {
  if (!(await confirmModal(`Törlöd a(z) "${t.name}" mentett tételt?`, { okText: "Törlés", cancelText: "Mégse", danger: true }))) return false;
  deleteItemTemplate(state.db, t.id); commit(); return true;
}
async function removeTransferTemplate(t) {
  if (!(await confirmModal(`Törlöd a(z) "${t.name}" mentett pénzmozgást?`, { okText: "Törlés", cancelText: "Mégse", danger: true }))) return false;
  deleteTransferTemplate(state.db, t.id); commit(); return true;
}
// Szűrő-panel: a tartalom helyben újrarajzolódik, a lista pedig a panel bezárásakor frissül.
function openFilterPanel() {
  const host = document.createElement("div");
  let hide;
  const redraw = () => host.replaceChildren(renderFilterPanel(state, handlers, redraw, () => { hide(); render(); }));
  redraw();
  hide = panelModal("Szűrők", host, () => render());
}

function openTemplateModal(id) {
  const t = state.db.templates.items.find(x => x.id === id);
  if (!t) return;
  let hide;
  const node = renderTemplateForm(state, {
    template: t,
    onSave: (tid, patch) => { updateItemTemplate(state.db, tid, patch); hide(); commit(); },
    onDelete: async (tpl) => { if (await removeTemplate(tpl)) hide(); },
    onCancel: () => hide(),
  });
  hide = panelModal("Elmentett tétel szerkesztése", node);
}
function openTransferTemplateModal(id) {
  const t = state.db.templates.transfers.find(x => x.id === id);
  if (!t) return;
  let hide;
  const node = renderTransferTemplateForm(state, {
    template: t,
    onSave: (tid, patch) => { updateTransferTemplate(state.db, tid, patch); hide(); commit(); },
    onDelete: async (tpl) => { if (await removeTransferTemplate(tpl)) hide(); },
    onCancel: () => hide(),
  });
  hide = panelModal("Elmentett pénzmozgás szerkesztése", node);
}

// --- Import ---
function extractPayload(input) {
  const s = String(input).trim();
  const m = s.match(/[?#]import=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : s;
}
function decodeToPreview(code) {
  let payload;
  try { payload = decodeImport(extractPayload(code)); } catch (e) { toast(e.message); return; }
  const month = payload.month || state.month;
  const rows = payload.items.map(it => ({
    name: it.name, qty: it.qty, price: it.price, store: it.store, date: it.date || month + "-01", payment: it.payment,
    categoryId: findCategoryIdByName(state.db, it.category) || state.db.categories[0].id,
  }));
  state.importPreview = { month, rows };
  render();
}
function confirmImport() {
  const { month, rows } = state.importPreview;
  addSnapshot(state.db, "blokk-bevitel előtt");   // telefonon tárolt, visszaállítható állapot
  for (const r of rows) addItem(state.db, month, { name: r.name, qty: r.qty, price: r.price, store: r.store, date: r.date, payment: r.payment, categoryId: r.categoryId });
  state.importPreview = null; state.view = "month"; state.month = month; commit();
  if (IS_IOS) {
    // iPhone-on a megosztó-lap csak kérdés után ugorhat fel.
    toast(`${rows.length} tétel hozzáadva.`);
    confirmModal("Készítsek biztonsági mentést fájlba is? (ajánlott)", { okText: "Igen, mentés", cancelText: "Most nem" })
      .then(yes => { if (yes) shareOrDownloadBackup(state.db); });
  } else {
    downloadBackup(state.db);                      // automatikus biztonsági mentés fájlba
    toast(`${rows.length} tétel hozzáadva. Biztonsági mentés letöltve (Letöltések).`);
  }
}

const handlers = {
  rerender: () => render(),
  onPrevMonth: () => { state.month = shiftMonth(state.month, -1); render(); },
  onNextMonth: () => { state.month = shiftMonth(state.month, 1); render(); },
  onSetMonth: (key) => { state.month = key; render(); },
  // A nyitás/csukás helyben, animálva történik (ui.js); itt csak elmentjük, újrarajzolás nélkül.
  onSetCollapsed: (key, collapsed) => {
    const c = state.db.settings.collapsed;
    if (collapsed) c[key] = true; else delete c[key];
    save(state.db);
  },
  onSetAccent: (key) => { state.db.settings.accent = key; applyAccent(key); commit(); },
  onSetFontScale: (v) => { state.db.settings.fontScale = v; applyFontScale(v); commit(); },
  onOpenHelp: () => helpModal(),
  onShowChangelog: () => {
    const today = new Date().toISOString().slice(0, 10);
    const recent = CHANGELOG.filter(e => daysBetween(e.date, today) <= 14);
    changelogModal(recent.length ? recent : [CHANGELOG[0]]);
  },
  onAddItem: () => { state.editing = { type: "item", id: null }; render(); },
  onEditItem: (id, monthKey) => {
    // Dátum-szűrésnél más hónap tétele is látszik — ilyenkor átváltunk arra a hónapra.
    if (monthKey && monthKey !== state.month) state.month = monthKey;
    state.editing = { type: "item", id }; render();
  },
  onAddTransfer: (dir) => { state.editing = { type: "transfer", id: null, dir }; render(); },
  onEditTransfer: (id) => { state.editing = { type: "transfer", id }; render(); },
  onTransferSearch: (v, { noFocus } = {}) => {
    state.transferSearch = v;
    render();
    if (noFocus) return;   // dátumválasztás/törlés után ne ugorjon fel a billentyűzet
    const si = document.getElementById("pm-search");
    if (si) { si.focus(); const n = si.value.length; try { si.setSelectionRange(n, n); } catch { /* noop */ } }
  },
  onManageCategories: () => { state.view = "categories"; render(); },
  onSetMonthTotalMode: (m, whileFiltering) => {
    state.monthTotalOpen = false;
    if (whileFiltering) { state.filterTotalMode = m; render(); return; }  // szűrés alatt nem írjuk át a beállítást
    state.db.settings.monthTotalMode = m; commit();
  },
  onOpenTemplates: () => { state.view = "templates"; state.tplSearch = ""; render(); },
  onTplSearch: (v) => {
    state.tplSearch = v;
    render();
    const si = document.getElementById("tpl-search");
    if (si) { si.focus(); const n = si.value.length; try { si.setSelectionRange(n, n); } catch { /* noop */ } }
  },
  onEditTemplate: (id) => openTemplateModal(id),
  onDeleteTemplate: (t) => removeTemplate(t),
  onEditTransferTemplate: (id) => openTransferTemplateModal(id),
  onDeleteTransferTemplate: (t) => removeTransferTemplate(t),
  onSearchInput: (v, { noFocus } = {}) => {
    state.search = v;
    render();
    if (noFocus) return;   // dátumválasztás/törlés után ne ugorjon fel a billentyűzet
    const si = document.getElementById("kiadas-search");
    if (si) { si.focus(); const n = si.value.length; try { si.setSelectionRange(n, n); } catch { /* nem szöveges */ } }
  },
  onOpenFilters: () => openFilterPanel(),
  onToggleFilterValue: (field, value) => {
    const cur = state.filters[field] || [];
    state.filters[field] = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
    render();
  },
  onClearFilterDate: () => { const f = state.filters; f.day = ""; f.from = ""; f.to = ""; render(); },
  onSetFilterPrice: (min, max) => { state.filters.min = min; state.filters.max = max; render(); },
  onClearFilters: () => {
    state.filters = emptyFilters();
    state.filterTotalMode = "filtered";
    render();
  },
  onPruneBackups: async () => {
    const yes = await confirmModal("Törlöm a telefonon tárolt, 7 napnál régebbi automatikus mentéseket? A fájlba mentett biztonsági mentéseket ez nem érinti.", { okText: "Törlés", cancelText: "Mégse", danger: true });
    if (!yes) return;
    const n = pruneOldBackups(7);
    toast(n ? `${n} régi mentés törölve.` : "Nincs 7 napnál régebbi mentés a telefonon.");
    render();
  },
  onSetCatChart: (mode) => { state.db.settings.catChartMode = mode; commit(); },
  onOpenReminders: () => { state.view = "reminders"; render(); },
  onAddReminder: () => { state.editing = { type: "reminder", id: null }; render(); },
  onEditReminder: (id) => { state.editing = { type: "reminder", id }; render(); },
  onTogglePaid: async (r) => {
    const wasPaid = (state.db.months[state.month]?.paidReminders || []).includes(r.id);
    toggleReminderPaid(state.db, state.month, r.id);
    commit();
    if (!wasPaid && r.amount != null && r.amount !== "") {
      const yes = await confirmModal(`Rögzítsem "${r.name}" (${new Intl.NumberFormat("hu-HU").format(r.amount)} Ft) kimenő pénzmozgásként is?`, { okText: "Igen, rögzítsd", cancelText: "Nem" });
      if (yes) {
        addTransfer(state.db, state.month, { dir: "out", name: r.name, amount: Number(r.amount), date: state.month + "-" + String(new Date().getDate()).padStart(2, "0"), partner: "", note: "kötelező kiadás", mandatory: true, method: r.payment === "cash" ? "cash" : "transfer" });
        commit();
      }
    }
  },
  onAddToCalendar: async (r) => {
    const how = await choiceModal("Hogyan tegyem a naptárba?", [
      { label: "Google Naptárral (Androidon ez az alap)", value: "google" },
      { label: "Naptár-fájllal (iPhone és más naptárak)", value: "ics" },
    ]);
    if (how === "google") {
      window.open(reminderToGoogleUrl(r), "_blank");
      toast("A Google Naptár megnyílt — ott már csak a Mentés kell.");
    } else if (how === "ics") {
      const ics = reminderToIcs(r);
      if (IS_IOS && navigator.canShare) {
        // iPhone: megosztó-lap — onnan a Naptár egyből felveszi.
        try {
          const file = new File([ics], `${r.name}.ics`.replace(/[\\/:*?"<>|]/g, "-"), { type: "text/calendar" });
          if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
        } catch (e) { if (e && e.name === "AbortError") return; /* egyébként: letöltés */ }
      }
      downloadText(`${r.name}.ics`, ics, "text/calendar;charset=utf-8");
      toast("Naptár-fájl letöltve. Nyisd meg (Letöltések), és a telefon naptára felveszi.");
    }
  },
  onEditImportRow: async (i) => {
    const r = state.importPreview && state.importPreview.rows[i];
    if (!r) return;
    const res = await formModal("Tétel javítása", [
      { key: "name", label: "Név", value: r.name },
      { key: "store", label: "Üzlet", value: r.store || "" },
      { key: "qty", label: "Darab", value: r.qty ?? 1, type: "number", min: 1 },
      { key: "price", label: "Ár — a sor teljes összege (Ft)", value: r.price, type: "number", min: 0 },
    ]);
    if (res) {
      if (res.name.trim()) r.name = res.name.trim();
      r.store = res.store.trim();
      const qty = Math.round(Number(res.qty));
      if (qty >= 1) r.qty = qty;
      const price = Math.round(Number(res.price));
      if (Number.isFinite(price) && price >= 0 && res.price !== "") r.price = price;
      render();
    }
  },
  onPickImportCat: async (i) => {
    const r = state.importPreview && state.importPreview.rows[i];
    if (!r) return;
    const cats = state.db.categories.slice().sort((a, b) => a.order - b.order).map(c => ({ label: c.name, value: c.id }));
    const choice = await choiceModal("Válassz kategóriát", cats);
    if (choice) { r.categoryId = choice; render(); }
  },
  onOpenImport: (code) => { state.view = "import"; state.importCode = code || ""; state.importPreview = null; render(); },
  onOpenImportView: () => handlers.onOpenImport(""),
  onCopyImportPrompt: async () => {
    try { await navigator.clipboard.writeText(buildImportPrompt()); toast("Kimásolva! Illeszd be a Claude appba a blokk fotójával."); }
    catch { toast("Nem sikerült a másolás. Másold ki kézzel a szöveget."); }
  },
  onCheckUpdate: async () => {
    if (!("serviceWorker" in navigator)) { toast("Ez az eszköz nem támogatja a háttérfrissítést."); return; }
    toast("Frissítés keresése…");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { location.reload(); return; }
      await reg.update();
      // Ha van új verzió, az települ és átveszi az irányítást → a controllerchange újratölt.
      const sw = reg.installing || reg.waiting;
      if (sw) { sw.postMessage?.({ type: "SKIP_WAITING" }); toast("Új verzió töltődik — mindjárt frissül."); }
      else toast(`Ez már a legfrissebb (${APP_VERSION}).`);
    } catch { toast("Nem sikerült ellenőrizni. Próbáld újra internettel."); }
  },
  onSetTheme: (t) => { state.db.settings.theme = t; applyTheme(t); save(state.db); },   // nincs render: így a színek szépen átúsznak
  onToggleNotifications: async () => {
    if (!state.db.settings.notifications) {
      if (!("Notification" in window)) { toast("Ez az eszköz nem támogatja az értesítéseket."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Az értesítés engedélyezése elmaradt."); return; }
      state.db.settings.notifications = true;
    } else {
      state.db.settings.notifications = false;
    }
    commit();
  },
  onExportMonth: () => downloadXlsx([{ name: "Kiadások", rows: expenseRows(state.db, state.month) }, { name: "Pénzmozgás", rows: transferRows(state.db, state.month) }], `koltseg-${state.month}.xlsx`),
  onExportAll: () => downloadXlsx([{ name: "Kiadások", rows: expenseRows(state.db, null) }, { name: "Pénzmozgás", rows: transferRows(state.db, null) }], `koltseg-mind.xlsx`),
  onBackup: () => shareOrDownloadBackup(state.db),
  onOpenRestore: () => { state.view = "restore"; render(); },
  onRestoreFile: () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = async () => { try { state.db = await readBackupFile(inp.files[0]); applyTheme(state.db.settings.theme); applyAccent(state.db.settings.accent); applyFontScale(state.db.settings.fontScale); state.view = "settings"; commit(); toast("Visszaállítva fájlból."); } catch (e) { toast(e.message); } };
    inp.click();
  },
  onRestoreSnapshot: async (i) => {
    const s = listBackups()[i];
    if (!s) return;
    const yes = await confirmModal(`Visszaállítod ezt a mentést?\n${s.date}\nA mostani adat felülíródik.`, { okText: "Visszaállítás", cancelText: "Mégse", danger: true });
    if (!yes) return;
    state.db = JSON.parse(JSON.stringify(s.data));
    applyTheme(state.db.settings.theme); applyAccent(state.db.settings.accent); applyFontScale(state.db.settings.fontScale);
    state.view = "settings"; commit(); toast("Visszaállítva.");
  },
  onBackFromRestore: () => { state.view = "settings"; render(); },
};

const GEAR_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
const TABS = [["month", "Kiadások"], ["transfers", "Pénzmozgás"], ["overview", "Áttekintő"], ["settings", "Beállítások"]];
function renderTabbar() {
  const bar = document.getElementById("tabbar");
  if (state.navHidden) {
    bar.className = "tabbar hidden";
    bar.replaceChildren(el("button", { class: "nav-handle", "aria-label": "Menü megnyitása", onclick: () => { state.navHidden = false; render(); } }, el("span", { class: "chev" }, "▴")));
    return;
  }
  bar.className = "tabbar";
  const inner = el("div", { class: "tabbar-inner" });
  inner.append(el("button", { class: "nav-toggle", "aria-label": "Menü elrejtése", onclick: () => { state.navHidden = true; render(); } }, el("span", { class: "chev" }, "▾")));
  for (const [view, label] of TABS) {
    const active = state.view === view && !state.editing;
    const isGear = view === "settings";
    const btn = el("button", { class: (active ? "primary" : "") + (isGear ? " tab-icon" : ""), "aria-label": label, title: isGear ? label : null, onclick: () => { state.editing = null; state.importPreview = null; state.view = view; render(); } }, isGear ? "" : label);
    if (isGear) btn.innerHTML = GEAR_SVG;
    inner.append(btn);
  }
  bar.replaceChildren(inner);
}

// --- Vissza-gomb kezelése: a history-mélységet a nézet-mélységhez szinkronizáljuk. ---
// A history-bejegyzéseket NAVIGÁLÁSKOR (render után) rakjuk fel/le, ami minden böngészőben
// megbízható; a vissza-esemény alatt csak a kilépéshez teszünk egy őrt.
const SETTINGS_SUB = ["categories", "import", "restore", "templates", "reminders"];
let histEntries = 0, suppressPop = 0;
function appDepth() {
  let d = 0;
  if (SETTINGS_SUB.includes(state.view)) d++; // alnézet a Beállítások alatt
  if (state.editing) d++;                      // nyitott űrlap
  return d;
}
function syncBackHistory() {
  const target = appDepth() + 1; // +1 az alap-őr (a főképernyőn: vissza -> kilépés-figyelmeztetés)
  while (histEntries < target) { history.pushState({ g: ++histEntries }, ""); }
  if (histEntries > target) {
    const over = histEntries - target;
    histEntries = target;
    suppressPop++;
    history.go(-over);
  }
}
window.addEventListener("popstate", () => {
  if (suppressPop > 0) { suppressPop--; return; }
  histEntries = Math.max(0, histEntries - 1);
  const ov = document.querySelector(".modal-overlay");
  if (ov) { ov.__dismiss ? ov.__dismiss() : null; history.pushState({ g: ++histEntries }, ""); return; } // ablak nyitva: azt zárja/elnyeli
  if (state.editing) { state.editing = null; render(); return; }           // űrlap bezárása
  if (SETTINGS_SUB.includes(state.view)) { state.view = "settings"; render(); return; } // alnézet -> Beállítások
  // Főképernyő: a belépő-ponton vagyunk (őr elfogyott). Az őrt NEM tesszük vissza azonnal,
  // így a pár mp-en belüli MÁSODIK Vissza natívan kilép — ezt a rendszer intézi, mindig működik.
  // Ha maradsz, az őr visszakerül, és a következő Vissza újra csak figyelmeztet.
  toast("Nyomd meg még egyszer a Vissza gombot a kilépéshez.");
  setTimeout(syncBackHistory, 2800);
});

let lastViewKey = "";
function render() {
  const root = document.getElementById("app");
  root.replaceChildren();
  // Fül-, hónap- vagy űrlapváltásnál finom áttűnés; sima frissítésnél (pl. gépelés) nem.
  const viewKey = state.view + "|" + state.month + "|" + (state.editing ? state.editing.type : "");
  if (viewKey !== lastViewKey) {
    lastViewKey = viewKey;
    root.classList.remove("view-in");
    void root.offsetWidth;   // újraindítja az animációt
    root.classList.add("view-in");
  }

  if (state.editing?.type === "item") {
    const it = state.editing.id ? state.db.months[state.month].items.find(i => i.id === state.editing.id) : null;
    root.append(renderItemForm(state, { item: it, onSave: saveItem, onDelete: removeItem, onCancel: () => { state.editing = null; render(); } }));
  } else if (state.editing?.type === "transfer") {
    const tr = state.editing.id ? state.db.months[state.month].transfers.find(t => t.id === state.editing.id) : null;
    root.append(renderTransferForm(state, { transfer: tr, dir: state.editing.dir, onSave: saveTransfer, onDelete: removeTransfer, onCancel: () => { state.editing = null; render(); } }));
  } else if (state.editing?.type === "reminder") {
    const r = state.editing.id ? state.db.reminders.find(x => x.id === state.editing.id) : null;
    root.append(renderReminderForm(state, { reminder: r, onSave: saveReminder, onDelete: removeReminder, onCancel: () => { state.editing = null; render(); } }));
  } else if (state.view === "templates") {
    root.append(renderTemplatesManager(state, { onTplSearch: handlers.onTplSearch, onEditTemplate: handlers.onEditTemplate, onDeleteTemplate: handlers.onDeleteTemplate, onEditTransferTemplate: handlers.onEditTransferTemplate, onDeleteTransferTemplate: handlers.onDeleteTransferTemplate, onBack: () => { state.editing = null; state.view = "settings"; render(); } }));
  } else if (state.view === "transfers") {
    root.append(renderTransfersView(state, handlers));
  } else if (state.view === "overview") {
    root.append(renderOverview(state, handlers));
  } else if (state.view === "reminders") {
    root.append(renderRemindersView(state, handlers));
  } else if (state.view === "categories") {
    root.append(renderCategoryManager(state, {
      onAdd: (n) => { addCategory(state.db, n); commit(); },
      onSave: (id, n, budget) => { if (n) renameCategory(state.db, id, n); setCategoryBudget(state.db, id, budget); commit(); },
      onReorder: (order) => { reorderCategories(state.db, order); commit(); },
      onDelete: onDeleteCategory,
      onBack: () => { state.view = "settings"; render(); },
    }));
  } else if (state.view === "import") {
    root.append(renderImportView(state, { initialCode: state.importCode, onDecode: decodeToPreview, onConfirm: confirmImport, onCopyPrompt: handlers.onCopyImportPrompt, onEditRow: handlers.onEditImportRow, onPickCat: handlers.onPickImportCat, onBack: () => { state.view = "settings"; render(); } }));
  } else if (state.view === "restore") {
    root.append(renderRestoreView(state, { onRestoreSnapshot: handlers.onRestoreSnapshot, onRestoreFile: handlers.onRestoreFile, onPruneBackups: handlers.onPruneBackups, onBack: handlers.onBackFromRestore }));
  } else if (state.view === "settings") {
    root.append(renderSettings(state, handlers));
  } else {
    root.append(renderMonthView(state, handlers));
  }
  renderTabbar();
  syncBackHistory();
}

// Import induláskor linkből: ?import=<kód> vagy #import=<kód>
(function handleImportFromUrl() {
  const q = new URLSearchParams(location.search).get("import");
  const hm = location.hash.match(/^#import=(.+)$/);
  const code = q || (hm ? decodeURIComponent(hm[1]) : null);
  if (code) {
    history.replaceState(null, "", location.pathname);
    state.view = "import"; state.importCode = code;
    decodeToPreview(code);
    return;
  }
  render();
})();

// Helyi értesítés a ma esedékesekről
(function notifyDueToday() {
  if (!state.db.settings.notifications) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const due = remindersDueOn(state.db, todayKey()).filter(r => r.notify !== false);
  for (const r of due) new Notification("Ma esedékes", { body: r.name + (r.amount != null && r.amount !== "" ? ` – ${r.amount} Ft` : ""), tag: "koltseg-" + r.id });
})();

// Ha most készült heti auto-mentés, ajánljuk fel fájlba/felhőbe mentésre (egy koppintás).
if (didAutoBackup) {
  confirmModal("Elkészült a heti automatikus mentés (ez csak a telefonon tárolódik). Készítsek biztonsági mentést fájlba is? (ajánlott)", { okText: "Igen, fájlba", cancelText: "Most nem" })
    .then(yes => { if (yes) shareOrDownloadBackup(state.db); });
}


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
