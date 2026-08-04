import { load, save, downloadBackup, readBackupFile, maybeAutoBackup, listBackups, shareOrDownloadBackup } from "./storage.js";
import { applyTheme, watchSystemTheme, applyAccent, applyFontScale } from "./theme.js";
import {
  addItem, updateItem, moveItem, deleteItem,
  addCategory, renameCategory, deleteCategory,
  addTransfer, updateTransfer, deleteTransfer,
  addReminder, updateReminder, deleteReminder, toggleReminderPaid, remindersDueOn, daysBetween,
  setCategoryBudget, reorderCategories, todayKey,
} from "./model.js";
import { decodeImport } from "./codec.js";
import { downloadXlsx, expenseRows, transferRows } from "./xlsx.js";
import { reminderToIcs } from "./ics.js";
import { toast, confirmModal, choiceModal, changelogModal, helpModal } from "./dialog.js";
import { CHANGELOG } from "./version.js";
import {
  el, shiftMonth, findCategoryIdByName,
  renderMonthView, renderItemForm, renderCategoryManager,
  renderTransfersView, renderTransferForm, renderOverview,
  renderImportView, renderRemindersView, renderReminderForm, renderSettings, renderRestoreView,
} from "./ui.js";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildImportPrompt() {
  const cats = state.db.categories.slice().sort((a, b) => a.order - b.order).map(c => c.name);
  const first = cats[0] || "Egyéb";
  return `Ez egy blokk fotója a "Költség" nevű költségkövető appomhoz. Olvasd ki a tételeket, és add vissza CSAK egy JSON-t (semmi más szöveg), pontosan ebben a formátumban:
{"month":"YYYY-MM","items":[{"name":"Tejföl","qty":2,"price":780,"store":"Lidl","date":"YYYY-MM-DD","payment":"card","category":"${first}"}]}
Szabályok:
- price = az adott sor teljes összege forintban, egész szám (nem egységár). qty = darabszám (ha nincs, 1).
- payment: kártya = "card", készpénz = "cash" (a blokkon általában rajta van).
- category CSAK ezek egyike legyen, pontosan így írva: ${cats.map(c => `"${c}"`).join(", ")}. Sorold mindegyik tételt a legmegfelelőbbe; ha egyik sem illik, válaszd a hozzá legközelebbit.
- month és date a blokkról; ha a hónap nem derül ki, a mostani hónap.
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
  else updateTransfer(state.db, state.month, cur, { name: f.name, amount: f.amount, date: f.date, partner: f.partner, note: f.note, method: f.method });
  state.editing = null; commit();
}
async function removeTransfer(id) {
  if (!(await confirmModal("Biztosan törlöd ezt az utalást?", { okText: "Törlés", cancelText: "Mégse", danger: true }))) return;
  deleteTransfer(state.db, state.month, id); state.editing = null; commit();
}

// --- Kategória ---
async function onDeleteCategory(c) {
  if (state.db.categories.length <= 1) { toast("Legalább egy kategória kell."); return; }
  const others = state.db.categories.filter(x => x.id !== c.id);
  const options = others.map(x => ({ label: `Áthelyezés ide: ${x.name}`, value: x.id }));
  options.push({ label: "Tételek törlése is", value: "__delete__", danger: true });
  const choice = await choiceModal(`"${c.name}" törlése. Mi legyen a benne lévő tételekkel?`, options);
  if (choice === null) return;
  deleteCategory(state.db, c.id, choice === "__delete__" ? null : choice);
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
  for (const r of rows) addItem(state.db, month, { name: r.name, qty: r.qty, price: r.price, store: r.store, date: r.date, payment: r.payment, categoryId: r.categoryId });
  state.importPreview = null; state.view = "month"; state.month = month; commit();
  toast(`${rows.length} tétel hozzáadva.`);
}

const handlers = {
  rerender: () => render(),
  onPrevMonth: () => { state.month = shiftMonth(state.month, -1); render(); },
  onNextMonth: () => { state.month = shiftMonth(state.month, 1); render(); },
  onSetMonth: (key) => { state.month = key; render(); },
  onToggleCollapse: (key) => { const c = state.db.settings.collapsed; c[key] = !c[key]; if (!c[key]) delete c[key]; commit(); },
  onSetAccent: (key) => { state.db.settings.accent = key; applyAccent(key); commit(); },
  onSetFontScale: (v) => { state.db.settings.fontScale = v; applyFontScale(v); commit(); },
  onOpenHelp: () => helpModal(),
  onShowChangelog: () => {
    const today = new Date().toISOString().slice(0, 10);
    const recent = CHANGELOG.filter(e => daysBetween(e.date, today) <= 14);
    changelogModal(recent.length ? recent : [CHANGELOG[0]]);
  },
  onAddItem: () => { state.editing = { type: "item", id: null }; render(); },
  onEditItem: (id) => { state.editing = { type: "item", id }; render(); },
  onAddTransfer: (dir) => { state.editing = { type: "transfer", id: null, dir }; render(); },
  onEditTransfer: (id) => { state.editing = { type: "transfer", id }; render(); },
  onManageCategories: () => { state.view = "categories"; render(); },
  onSearchInput: (v) => {
    state.search = v;
    render();
    const si = document.getElementById("kiadas-search");
    if (si) { si.focus(); const n = si.value.length; try { si.setSelectionRange(n, n); } catch { /* nem szöveges */ } }
  },
  onOpenReminders: () => { state.view = "reminders"; render(); },
  onAddReminder: () => { state.editing = { type: "reminder", id: null }; render(); },
  onEditReminder: (id) => { state.editing = { type: "reminder", id }; render(); },
  onTogglePaid: async (r) => {
    const wasPaid = (state.db.months[state.month]?.paidReminders || []).includes(r.id);
    toggleReminderPaid(state.db, state.month, r.id);
    commit();
    if (!wasPaid && r.amount != null && r.amount !== "") {
      const yes = await confirmModal(`Rögzítsem "${r.name}" (${new Intl.NumberFormat("hu-HU").format(r.amount)} Ft) kimenő utalásként is?`, { okText: "Igen, rögzítsd", cancelText: "Nem" });
      if (yes) {
        addTransfer(state.db, state.month, { dir: "out", name: r.name, amount: Number(r.amount), date: state.month + "-" + String(new Date().getDate()).padStart(2, "0"), partner: "", note: "kötelező kiadás" });
        commit();
      }
    }
  },
  onAddToCalendar: (r) => downloadText(`${r.name}.ics`, reminderToIcs(r), "text/calendar;charset=utf-8"),
  onOpenImport: (code) => { state.view = "import"; state.importCode = code || ""; state.importPreview = null; render(); },
  onOpenImportView: () => handlers.onOpenImport(""),
  onCopyImportPrompt: async () => {
    try { await navigator.clipboard.writeText(buildImportPrompt()); toast("Kimásolva! Illeszd be a Claude appba a blokk fotójával."); }
    catch { toast("Nem sikerült a másolás. Másold ki kézzel a szöveget."); }
  },
  onSetTheme: (t) => { state.db.settings.theme = t; applyTheme(t); commit(); },
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
  onExportMonth: () => downloadXlsx([{ name: "Kiadások", rows: expenseRows(state.db, state.month) }, { name: "Utalások", rows: transferRows(state.db, state.month) }], `koltseg-${state.month}.xlsx`),
  onExportAll: () => downloadXlsx([{ name: "Kiadások", rows: expenseRows(state.db, null) }, { name: "Utalások", rows: transferRows(state.db, null) }], `koltseg-mind.xlsx`),
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

function render() {
  const root = document.getElementById("app");
  root.replaceChildren();

  if (state.editing?.type === "item") {
    const it = state.editing.id ? state.db.months[state.month].items.find(i => i.id === state.editing.id) : null;
    root.append(renderItemForm(state, { item: it, onSave: saveItem, onDelete: removeItem, onCancel: () => { state.editing = null; render(); } }));
  } else if (state.editing?.type === "transfer") {
    const tr = state.editing.id ? state.db.months[state.month].transfers.find(t => t.id === state.editing.id) : null;
    root.append(renderTransferForm(state, { transfer: tr, dir: state.editing.dir, onSave: saveTransfer, onDelete: removeTransfer, onCancel: () => { state.editing = null; render(); } }));
  } else if (state.editing?.type === "reminder") {
    const r = state.editing.id ? state.db.reminders.find(x => x.id === state.editing.id) : null;
    root.append(renderReminderForm(state, { reminder: r, onSave: saveReminder, onDelete: removeReminder, onCancel: () => { state.editing = null; render(); } }));
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
    root.append(renderImportView(state, { initialCode: state.importCode, onDecode: decodeToPreview, onConfirm: confirmImport, onCopyPrompt: handlers.onCopyImportPrompt, onBack: () => { state.view = "settings"; render(); } }));
  } else if (state.view === "restore") {
    root.append(renderRestoreView(state, { onRestoreSnapshot: handlers.onRestoreSnapshot, onRestoreFile: handlers.onRestoreFile, onBack: handlers.onBackFromRestore }));
  } else if (state.view === "settings") {
    root.append(renderSettings(state, handlers));
  } else {
    root.append(renderMonthView(state, handlers));
  }
  renderTabbar();
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
  confirmModal("Elkészült a heti biztonsági mentés a telón. Mentsd el fájlba / felhőbe is? (ajánlott)", { okText: "Igen, mentés", cancelText: "Most nem" })
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
