import { load, save, downloadBackup, readBackupFile } from "./storage.js";
import { applyTheme, watchSystemTheme, applyAccent } from "./theme.js";
import {
  addItem, updateItem, moveItem, deleteItem,
  addCategory, renameCategory, deleteCategory,
  addTransfer, updateTransfer, deleteTransfer,
  addReminder, updateReminder, deleteReminder, toggleReminderPaid, remindersDueOn,
} from "./model.js";
import { decodeImport } from "./codec.js";
import { expensesCsv, transfersCsv } from "./csv.js";
import { reminderToIcs } from "./ics.js";
import {
  el, shiftMonth, findCategoryIdByName,
  renderMonthView, renderItemForm, renderCategoryManager,
  renderTransfersView, renderTransferForm, renderOverview,
  renderImportView, renderRemindersView, renderReminderForm, renderSettings,
} from "./ui.js";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const IMPORT_PROMPT = `Ez egy blokk fotója a "Költség" nevű költségkövető appomhoz. Olvasd ki a tételeket, és add vissza CSAK egy JSON-t (semmi más szöveg), pontosan ebben a formátumban:
{"month":"YYYY-MM","items":[{"name":"Tejföl","qty":2,"price":780,"store":"Lidl","date":"YYYY-MM-DD","payment":"card","category":"Élelmiszer"}]}
Szabályok:
- price = az adott sor teljes összege forintban, egész szám (nem egységár). qty = darabszám (ha nincs, 1).
- payment: kártya = "card", készpénz = "cash" (a blokkon általában rajta van).
- category CSAK ezek egyike legyen: "Élelmiszer" (hétköznapi kaja: hús, zöldség, kenyér, tej, kávé, fűszer...), "Alkohol/üdítő" (alkohol és üdítők), "Tisztítószer" (takarítás és tisztálkodás: mosószer, wc-papír, tusfürdő, izzadásgátló...), "Macska" (alom, macskakaja, játék), "Luxus" (nasi, csoki, rendelt kaja, videojáték).
- month és date a blokkról; ha a hónap nem derül ki, a mostani hónap.
Csatolom a blokk fotóját.`;

const state = {
  db: load(),
  month: currentMonthKey(),
  view: "month",
  editing: null,        // { type: "item"|"transfer"|"reminder", id, dir? }
  importCode: "",
  importPreview: null,
  navHidden: false,
};

applyTheme(state.db.settings.theme);
applyAccent(state.db.settings.accent);
watchSystemTheme(() => state.db.settings.theme);

function commit() { save(state.db); render(); }

function downloadText(name, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// --- Tétel ---
function saveItem(f) {
  const cur = state.editing.id;
  if (cur == null) addItem(state.db, state.month, f);
  else {
    updateItem(state.db, state.month, cur, { name: f.name, qty: f.qty, price: f.price, store: f.store, date: f.date, payment: f.payment });
    moveItem(state.db, state.month, cur, f.categoryId);
  }
  state.editing = null; commit();
}
function removeItem(id) { deleteItem(state.db, state.month, id); state.editing = null; commit(); }

// --- Utalás ---
function saveTransfer(f) {
  const cur = state.editing.id;
  if (cur == null) addTransfer(state.db, state.month, f);
  else updateTransfer(state.db, state.month, cur, { name: f.name, amount: f.amount, date: f.date, partner: f.partner, note: f.note });
  state.editing = null; commit();
}
function removeTransfer(id) { deleteTransfer(state.db, state.month, id); state.editing = null; commit(); }

// --- Kategória ---
function onDeleteCategory(c) {
  if (state.db.categories.length <= 1) { alert("Legalább egy kategória kell."); return; }
  const others = state.db.categories.filter(x => x.id !== c.id);
  const list = others.map((x, i) => `${i + 1}. ${x.name}`).join("\n");
  const ans = prompt(`"${c.name}" törlése. Hova soroljam át a tételeit?\n${list}\n\nAdj meg egy sorszámot, vagy írd: torol`, "1");
  if (ans === null) return;
  if (ans.trim().toLowerCase() === "torol") deleteCategory(state.db, c.id, null);
  else {
    const idx = Number(ans) - 1;
    if (!others[idx]) { alert("Érvénytelen választás."); return; }
    deleteCategory(state.db, c.id, others[idx].id);
  }
  commit();
}

// --- Emlékeztető ---
function saveReminder(f) {
  const cur = state.editing.id;
  if (cur == null) addReminder(state.db, f);
  else updateReminder(state.db, cur, f);
  state.editing = null; commit();
}
function removeReminder(id) { deleteReminder(state.db, id); state.editing = null; commit(); }

// --- Import ---
function extractPayload(input) {
  const s = String(input).trim();
  const m = s.match(/[?#]import=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : s;
}
function decodeToPreview(code) {
  let payload;
  try { payload = decodeImport(extractPayload(code)); } catch (e) { alert(e.message); return; }
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
  alert(`${rows.length} tétel hozzáadva.`);
}

const handlers = {
  rerender: () => render(),
  onPrevMonth: () => { state.month = shiftMonth(state.month, -1); render(); },
  onNextMonth: () => { state.month = shiftMonth(state.month, 1); render(); },
  onSetMonth: (key) => { state.month = key; render(); },
  onToggleCollapse: (key) => { const c = state.db.settings.collapsed; c[key] = !c[key]; if (!c[key]) delete c[key]; commit(); },
  onSetAccent: (key) => { state.db.settings.accent = key; applyAccent(key); commit(); },
  onAddItem: () => { state.editing = { type: "item", id: null }; render(); },
  onEditItem: (id) => { state.editing = { type: "item", id }; render(); },
  onAddTransfer: (dir) => { state.editing = { type: "transfer", id: null, dir }; render(); },
  onEditTransfer: (id) => { state.editing = { type: "transfer", id }; render(); },
  onManageCategories: () => { state.view = "categories"; render(); },
  onOpenReminders: () => { state.view = "reminders"; render(); },
  onAddReminder: () => { state.editing = { type: "reminder", id: null }; render(); },
  onEditReminder: (id) => { state.editing = { type: "reminder", id }; render(); },
  onTogglePaid: (r) => {
    const wasPaid = (state.db.months[state.month]?.paidReminders || []).includes(r.id);
    toggleReminderPaid(state.db, state.month, r.id);
    if (!wasPaid && r.amount != null && r.amount !== "" && confirm(`Rögzítsem "${r.name}" (${r.amount} Ft) kimenő utalásként is?`)) {
      addTransfer(state.db, state.month, { dir: "out", name: r.name, amount: Number(r.amount), date: state.month + "-" + String(new Date().getDate()).padStart(2, "0"), partner: "", note: "kötelező kiadás" });
    }
    commit();
  },
  onAddToCalendar: (r) => downloadText(`${r.name}.ics`, reminderToIcs(r), "text/calendar;charset=utf-8"),
  onOpenImport: (code) => { state.view = "import"; state.importCode = code || ""; state.importPreview = null; render(); },
  onOpenImportView: () => handlers.onOpenImport(""),
  onCopyImportPrompt: async () => {
    try { await navigator.clipboard.writeText(IMPORT_PROMPT); alert("Kimásolva! Nyisd meg a Claude appot, illeszd be, és csatold a blokk fotóját. A választ (JSON) másold vissza ide a beolvasó mezőbe."); }
    catch { alert("Nem sikerült a másolás. Jelöld ki és másold ki kézzel a szöveget."); }
  },
  onSetTheme: (t) => { state.db.settings.theme = t; applyTheme(t); commit(); },
  onToggleNotifications: async () => {
    if (!state.db.settings.notifications) {
      if (!("Notification" in window)) { alert("Ez az eszköz nem támogatja az értesítéseket."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { alert("Az értesítés engedélyezése elmaradt."); return; }
      state.db.settings.notifications = true;
    } else {
      state.db.settings.notifications = false;
    }
    commit();
  },
  onExportMonth: () => { downloadText(`koltseg-kiadasok-${state.month}.csv`, expensesCsv(state.db, state.month)); downloadText(`koltseg-utalasok-${state.month}.csv`, transfersCsv(state.db, state.month)); },
  onExportAll: () => { downloadText(`koltseg-kiadasok-mind.csv`, expensesCsv(state.db, null)); downloadText(`koltseg-utalasok-mind.csv`, transfersCsv(state.db, null)); },
  onBackup: () => downloadBackup(state.db),
  onRestore: () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = async () => { try { state.db = await readBackupFile(inp.files[0]); applyTheme(state.db.settings.theme); commit(); alert("Backup visszatöltve."); } catch (e) { alert(e.message); } };
    inp.click();
  },
};

const TABS = [["month", "Kiadások"], ["transfers", "Utalások"], ["overview", "Áttekintő"], ["settings", "Beállítások"]];
function renderTabbar() {
  const bar = document.getElementById("tabbar");
  if (state.navHidden) {
    bar.className = "tabbar hidden";
    bar.replaceChildren(el("button", { class: "nav-handle", "aria-label": "Menü megnyitása", onclick: () => { state.navHidden = false; render(); } }, "▴"));
    return;
  }
  bar.className = "tabbar";
  const inner = el("div", { class: "tabbar-inner" });
  inner.append(el("button", { class: "nav-toggle", "aria-label": "Menü elrejtése", onclick: () => { state.navHidden = true; render(); } }, "▾"));
  for (const [view, label] of TABS) {
    inner.append(el("button", { class: state.view === view && !state.editing ? "primary" : "", onclick: () => { state.editing = null; state.importPreview = null; state.view = view; render(); } }, label));
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
      onRename: (id, n) => { if (n) { renameCategory(state.db, id, n); commit(); } },
      onDelete: onDeleteCategory,
      onBack: () => { state.view = "settings"; render(); },
    }));
  } else if (state.view === "import") {
    root.append(renderImportView(state, { initialCode: state.importCode, onDecode: decodeToPreview, onConfirm: confirmImport, onCopyPrompt: handlers.onCopyImportPrompt, onBack: () => { state.view = "settings"; render(); } }));
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
  const due = remindersDueOn(state.db, new Date().toISOString().slice(0, 10));
  for (const r of due) new Notification("Ma esedékes", { body: r.name + (r.amount != null && r.amount !== "" ? ` – ${r.amount} Ft` : ""), tag: "koltseg-" + r.id });
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
