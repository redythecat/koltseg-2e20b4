import { monthOverview, categoryTotal, remindersDueInMonth, occurrencesInMonth, dueSummaryForMonth, todayKey, monthComparison, monthStats, yearTotal } from "./model.js";
import { ACCENTS } from "./theme.js";
import { toast } from "./dialog.js";
import { APP_VERSION, APP_DATE } from "./version.js";
import { listBackups } from "./storage.js";

const YEARS = Array.from({ length: 2100 - 2025 + 1 }, (_, i) => 2025 + i);
const MONTH_SHORT = ["jan.", "feb.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

export function isCollapsed(state, key) { return !!(state.db.settings.collapsed && state.db.settings.collapsed[key]); }
function chev(open) { return el("span", { class: "chev" }, open ? "▾" : "▸"); }

function fmtDay(dateKey) {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}.`;
}
function dueWhenText(daysUntil) {
  if (daysUntil < 0) return `${-daysUntil} napja lejárt`;
  if (daysUntil === 0) return "ma esedékes";
  if (daysUntil === 1) return "holnap";
  return `${daysUntil} nap múlva`;
}

// Év/hónap választó (Kiadások és Áttekintő közösen használja)
export function renderMonthNav(state, h) {
  const [y, m] = state.month.split("-").map(Number);
  const ySel = el("select", { "aria-label": "Év", onchange: e => h.onSetMonth(`${e.target.value}-${String(m).padStart(2, "0")}`) },
    ...YEARS.map(yy => el("option", { value: yy, ...(yy === y ? { selected: "" } : {}) }, String(yy))));
  const mSel = el("select", { "aria-label": "Hónap", onchange: e => h.onSetMonth(`${y}-${e.target.value}`) },
    ...MONTHS.map((name, i) => { const val = String(i + 1).padStart(2, "0"); return el("option", { value: val, ...(i + 1 === m ? { selected: "" } : {}) }, name); }));
  return el("div", { class: "month-nav" },
    el("button", { class: "ghost", "aria-label": "Előző hónap", onclick: h.onPrevMonth }, "‹"),
    ySel, mSel,
    el("button", { class: "ghost", "aria-label": "Következő hónap", onclick: h.onNextMonth }, "›"));
}

// Fix, felül megjelenő kötelező kiadások — checkboxszal, esedékességgel, sürgős piros jelöléssel
export function renderRemindersPinned(state, h) {
  const due = dueSummaryForMonth(state.db, state.month, todayKey());
  if (!due.length) return null;
  const open = !isCollapsed(state, "rem");
  const unpaid = due.filter(d => !d.paid).length;
  const card = el("div", { class: "card", style: "border-color:var(--accent)" });
  card.append(el("button", { class: "collapse-head", onclick: () => h.onToggleCollapse("rem") },
    el("span", { class: "left" }, chev(open), el("span", { class: "sec-title" }, "Kötelező kiadások")),
    el("span", { class: "sec-sum" }, unpaid ? `${unpaid} hátra` : "kész")));
  if (open) {
    for (const d of due) {
      const cb = el("input", { type: "checkbox", ...(d.paid ? { checked: "" } : {}), onchange: () => h.onTogglePaid(d.reminder) });
      card.append(el("div", { class: "due-row" }, cb,
        el("div", { class: "due-main" },
          el("div", {}, d.reminder.name + (d.reminder.amount != null && d.reminder.amount !== "" ? ` — ${ft(d.reminder.amount)}` : "")),
          el("div", { class: "due-when" + (d.urgent ? " urgent" : "") }, `${fmtDay(d.date)} · ${d.paid ? "kifizetve" : dueWhenText(d.daysUntil)}`))));
    }
  }
  return card;
}

// --- Segédek ---

export function ft(n) { return new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft"; }

const MONTHS = ["január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"];
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${y} ${MONTHS[m - 1]}`;
}
export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) n.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ""));
  return n;
}

export function attachLongPress(node, cb) {
  let timer = null, sx = 0, sy = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  node.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; timer = setTimeout(() => { timer = null; cb(); }, 500); });
  node.addEventListener("pointermove", (e) => { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) clear(); });
  node.addEventListener("pointerup", clear);
  node.addEventListener("pointercancel", clear);
  node.addEventListener("pointerleave", clear);
}

export function findCategoryIdByName(db, name) {
  const c = db.categories.find(x => x.name.toLowerCase() === String(name || "").toLowerCase());
  return c ? c.id : null;
}

const FREQ_LABEL = { none: "egyszeri", daily: "napi", weekly: "heti", monthly: "havi" };

// --- Hónap nézet ---

function renderMonthTotal(state, h) {
  const o = monthOverview(state.db, state.month);
  const total = o.totalExpense, items = o.expenseItems;
  if (o.expenseOut <= 0) {
    return el("div", { class: "month-total" }, el("span", { class: "mt-label" }, "Havi kiadás"), el("span", { class: "mt-amount" }, ft(total)));
  }
  const mode = state.db.settings.monthTotalMode === "items" ? "items" : "total";
  const primaryVal = mode === "items" ? items : total;
  const primaryLabel = mode === "items" ? "Bolti kiadás" : "Havi összes";
  const open = state.monthTotalOpen;
  const box = el("div", { class: "month-total stack" });
  box.append(el("button", { class: "mt-head", onclick: h.onToggleMonthTotal },
    el("span", { class: "mt-label" }, primaryLabel),
    el("span", { class: "right" }, el("span", { class: "mt-amount" }, ft(primaryVal)), el("span", { class: "chev-sm" }, open ? "▾" : "▸"))));
  if (open) {
    const opt = (m, label, val) => el("button", { class: "mt-opt" + (mode === m ? " sel" : ""), onclick: () => h.onSetMonthTotalMode(m) },
      el("span", {}, label), el("span", { class: "v" }, ft(val)));
    box.append(opt("total", "Havi összes", total));
    box.append(opt("items", "Bolti (kötelezők nélkül)", items));
  }
  return box;
}

export function renderMonthView(state, h) {
  const { db, month } = state;
  const wrap = el("div");

  const pinned = renderRemindersPinned(state, h); if (pinned) wrap.append(pinned);

  wrap.append(renderMonthNav(state, h));

  const q = (state.search || "").trim().toLowerCase();
  wrap.append(el("input", { id: "kiadas-search", value: state.search || "", placeholder: "Keresés (név vagy üzlet)", oninput: e => h.onSearchInput(e.target.value), style: "margin:10px 0 8px" }));
  wrap.append(el("button", { class: "primary", onclick: h.onAddItem, style: "width:100%;margin:0 0 10px" }, "Új tétel"));
  wrap.append(renderMonthTotal(state, h));

  const m = db.months[month] || { items: [], transfers: [] };
  if (!q && m.items.length === 0) {
    wrap.append(el("div", { class: "empty-hint" },
      el("strong", {}, "Még nincs tétel ebben a hónapban"),
      el("div", { class: "muted" }, "Vedd fel az elsőt az „Új tétel” gombbal, vagy olvass be egy blokkot: Beállítások → Blokk import.")));
  }
  let shownAny = false;
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    let items = m.items.filter(i => i.categoryId === c.id);
    if (q) items = items.filter(it => (it.name + " " + (it.store || "")).toLowerCase().includes(q));
    if (q && !items.length) continue;
    shownAny = true;
    const key = "cat:" + c.id;
    const open = q ? true : !isCollapsed(state, key);
    const total = categoryTotal(db, month, c.id);
    const over = c.budget && total > c.budget;
    const card = el("div", { class: "card" });
    card.append(el("button", { class: "collapse-head", onclick: () => h.onToggleCollapse(key) },
      el("span", { class: "left" }, chev(open), el("span", { class: "sec-title" }, c.name)),
      el("span", { class: "sec-sum", style: over ? "color:var(--neg)" : "" }, c.budget ? `${ft(total)} / ${ft(c.budget)}` : ft(total))));
    if (c.budget) {
      const pct = Math.min(100, Math.round((total / c.budget) * 100));
      card.append(el("div", { class: "bar" }, el("span", { style: `width:${pct}%` + (over ? ";background:var(--neg)" : "") })));
    }
    if (open) {
      for (const it of items) {
        card.append(el("div", { class: "item", onclick: () => h.onEditItem(it.id) },
          el("div", {}, el("div", {}, it.name), el("small", {}, `${it.qty} db · ${it.store || "—"} · ${it.payment === "cash" ? "kp" : "kártya"}`)),
          el("div", {}, ft(it.price))));
      }
      if (!items.length) card.append(el("div", { class: "item muted" }, "Nincs tétel"));
    }
    wrap.append(card);
  }
  if (q && !shownAny) wrap.append(el("div", { class: "card muted" }, "Nincs találat."));
  return wrap;
}

// --- Tétel űrlap ---

export function renderItemForm(state, { item, onSave, onDelete, onCancel }) {
  const { db } = state;
  const v = item || { name: "", qty: 1, price: "", store: "", date: todayKey(), payment: "card", categoryId: db.categories[0]?.id };
  const f = { ...v };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, item ? "Tétel szerkesztése" : "Új tétel"));

  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Név" });
  // Egységár nyilvántartása, hogy a darabszám állításakor szorozni tudjunk.
  f.unit = (f.qty > 0 && f.price !== "" && f.price != null) ? Number(f.price) / f.qty : 0;
  const inQty = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.qty, oninput: e => {
    f.qty = Math.max(0, Number(e.target.value) || 0);
    if (f.unit) { f.price = Math.round(f.unit * f.qty); inPrice.value = f.price; }
  } });
  const inPrice = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.price, oninput: e => {
    f.price = Number(e.target.value);
    f.unit = f.qty > 0 ? f.price / f.qty : f.price;
  }, placeholder: "Ár (Ft)" });
  const inStore = el("input", { value: f.store, oninput: e => f.store = e.target.value, placeholder: "Üzlet" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
  const selPay = el("select", { onchange: e => f.payment = e.target.value },
    el("option", { value: "card", ...(f.payment === "card" ? { selected: "" } : {}) }, "Kártya"),
    el("option", { value: "cash", ...(f.payment === "cash" ? { selected: "" } : {}) }, "Készpénz"));
  const selCat = el("select", { onchange: e => f.categoryId = e.target.value },
    ...db.categories.map(c => el("option", { value: c.id, ...(c.id === f.categoryId ? { selected: "" } : {}) }, c.name)));

  if (!item && db.templates.items.length) {
    const templates = db.templates.items.slice().sort((a, b) => a.name.localeCompare(b.name, "hu"));
    const chevSpan = el("span", { class: "chev" }, "▸");
    const header = el("button", { class: "collapse-head", type: "button" },
      el("span", { class: "left" }, chevSpan, el("span", { class: "sec-title", style: "font-size:1rem" }, `Gyorslista (${templates.length})`)));
    const search = el("input", { placeholder: "Keresés a mentettek közt", style: "margin-bottom:8px" });
    const quick = el("div", { class: "quick" });
    for (const t of templates) {
      quick.append(el("button", { class: "ghost", type: "button", "data-name": t.name.toLowerCase(), onclick: () => {
        inName.value = f.name = t.name;
        inStore.value = f.store = t.store || "";
        inQty.value = f.qty = t.lastQty ?? 1;
        inPrice.value = f.price = t.lastPrice ?? "";
        f.unit = t.lastPrice ?? 0;
        selPay.value = f.payment = t.payment || "card";
        if (db.categories.find(c => c.id === t.categoryId)) { selCat.value = f.categoryId = t.categoryId; }
      } }, `+ ${t.name}`));
    }
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      for (const btn of quick.children) btn.style.display = (!q || btn.getAttribute("data-name").includes(q)) ? "" : "none";
    };
    const body = el("div", { style: "display:none" }, search, quick);
    let open = false;
    header.onclick = () => { open = !open; body.style.display = open ? "" : "none"; chevSpan.textContent = open ? "▾" : "▸"; };
    wrap.append(header, body);
  }

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Darab"), inQty), el("div", {}, el("label", {}, "Ár (Ft)"), inPrice)));
  wrap.append(el("label", {}, "Üzlet"), inStore);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Dátum"), inDate), el("div", {}, el("label", {}, "Fizetés"), selPay)));
  wrap.append(el("label", {}, "Kategória"), selCat);

  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name || !(f.price >= 0)) { toast("Név és ár kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (item && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(item.id) }, "Törlés"));
  return wrap;
}

// --- Kategória-kezelő ---

function setupCategoryDrag(handle, card, list, onReorder) {
  let timer = null, activated = false, startY = 0;
  const cleanup = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (activated) { card.classList.remove("dragging"); activated = false; }
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  const activate = () => { activated = true; card.classList.add("dragging"); };
  const onMove = (e) => {
    if (!activated) { if (Math.abs(e.clientY - startY) > 12) cleanup(); return; }
    e.preventDefault();
    const others = [...list.querySelectorAll(".cat-card")].filter(x => x !== card);
    let after = null;
    for (const other of others) {
      const r = other.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { after = other; break; }
    }
    const willChange = after == null ? list.lastElementChild !== card : after !== card.nextElementSibling;
    if (!willChange) return;
    // FLIP animáció: rögzítjük a pozíciókat, áthelyezünk, majd visszacsúsztatjuk átmenettel
    const cards = [...list.querySelectorAll(".cat-card")];
    const firsts = new Map(cards.map(c => [c, c.getBoundingClientRect().top]));
    if (after == null) list.appendChild(card); else list.insertBefore(card, after);
    for (const c of cards) {
      const dy = firsts.get(c) - c.getBoundingClientRect().top;
      if (!dy) continue;
      c.style.transition = "none";
      c.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => { c.style.transition = "transform 0.16s ease"; c.style.transform = ""; });
    }
  };
  const onUp = () => {
    const wasActive = activated;
    cleanup();
    if (wasActive) onReorder([...list.querySelectorAll(".cat-card")].map(x => x.getAttribute("data-id")));
  };
  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    timer = setTimeout(activate, 450);
  });
}

export function renderCategoryManager(state, { onAdd, onSave, onDelete, onBack, onReorder }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Kategóriák"), el("button", { class: "ghost", onclick: onBack }, "Kész")));
  wrap.append(el("p", { class: "muted", style: "margin-top:0" }, "Sorrend: a fogantyút (≡) tartsd nyomva, majd húzd a kategóriát fel/le."));
  const list = el("div", { id: "cat-list" });
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    const card = el("div", { class: "card cat-card", "data-id": c.id });
    const handle = el("div", { class: "drag-handle", "aria-label": "Áthelyezés – tartsd nyomva és húzd" }, "≡");
    setupCategoryDrag(handle, card, list, onReorder);
    card.append(handle);
    const nameInput = el("input", { value: c.name });
    const budgetInput = el("input", { type: "number", inputmode: "numeric", min: "0", value: c.budget ?? "", placeholder: "nincs" });
    card.append(el("div", { class: "row" },
      el("div", {}, el("label", {}, "Név"), nameInput),
      el("div", {}, el("label", {}, "Havi keret (Ft)"), budgetInput)));
    const actions = el("div", { class: "row", style: "margin-top:8px" });
    actions.append(el("button", { class: "primary", onclick: () => onSave(c.id, nameInput.value.trim(), budgetInput.value === "" ? null : Number(budgetInput.value)) }, "Mentés"));
    actions.append(el("button", { class: "ghost", style: "color:var(--neg)", onclick: () => onDelete(c) }, "Törlés"));
    card.append(actions);
    list.append(card);
  }
  wrap.append(list);
  const nc = el("input", { placeholder: "Új kategória neve" });
  wrap.append(el("div", { class: "card" }, el("label", {}, "Új kategória"), nc,
    el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => { if (nc.value.trim()) onAdd(nc.value.trim()); } }, "Hozzáadás")));
  wrap.append(el("p", { class: "muted" }, "A havi keret opcionális. Ha megadod, a Kiadásoknál a kategória sávval mutatja, hol tartasz, és pirosra vált, ha átléped."));
  return wrap;
}

// --- Elmentett tételek (sablonok) kezelése ---

export function renderTemplatesManager(state, h) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Elmentett tételek"), el("button", { class: "ghost", onclick: h.onBack }, "Kész")));
  wrap.append(el("input", { id: "tpl-search", value: state.tplSearch || "", placeholder: "Keresés név szerint", oninput: e => h.onTplSearch(e.target.value), style: "margin-bottom:8px" }));

  const q = (state.tplSearch || "").trim().toLowerCase();
  const catName = id => (db.categories.find(c => c.id === id) || {}).name || "—";
  let list = db.templates.items.slice().sort((a, b) => a.name.localeCompare(b.name, "hu"));
  if (q) list = list.filter(t => t.name.toLowerCase().includes(q));
  const total = list.length;
  const shown = list.slice(0, 60);

  if (!db.templates.items.length) wrap.append(el("div", { class: "card muted" }, "Még nincs elmentett tétel. Ahogy tételeket veszel fel, ezek automatikusan ide kerülnek gyorslistának."));
  else if (!total) wrap.append(el("div", { class: "card muted" }, "Nincs találat."));

  for (const t of shown) {
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" }, el("span", { class: "sec-title", style: "font-size:1rem" }, t.name), el("span", { class: "muted" }, `~${ft(t.lastPrice ?? 0)}/db`)));
    card.append(el("div", { class: "muted", style: "margin:2px 0 8px" }, `${catName(t.categoryId)} · ${t.store || "—"} · ${t.payment === "cash" ? "kp" : "kártya"}`));
    const row = el("div", { class: "row" });
    row.append(el("button", { class: "ghost", onclick: () => h.onEditTemplate(t.id) }, "Szerkeszt"));
    row.append(el("button", { class: "ghost", style: "color:var(--neg)", onclick: () => h.onDeleteTemplate(t) }, "Töröl"));
    card.append(row);
    wrap.append(card);
  }
  if (total > shown.length) wrap.append(el("p", { class: "muted" }, `${shown.length} / ${total} látszik — finomíts a keresésen a többihez.`));
  return wrap;
}

export function renderTemplateForm(state, { template, onSave, onDelete, onCancel }) {
  const { db } = state;
  const f = { name: template.name, store: template.store || "", lastPrice: template.lastPrice ?? "", categoryId: template.categoryId, payment: template.payment || "card" };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, "Elmentett tétel szerkesztése"));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Név" });
  const inStore = el("input", { value: f.store, oninput: e => f.store = e.target.value, placeholder: "Üzlet" });
  const inPrice = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.lastPrice, oninput: e => f.lastPrice = Number(e.target.value), placeholder: "Egységár (Ft)" });
  const selPay = el("select", { onchange: e => f.payment = e.target.value },
    el("option", { value: "card", ...(f.payment === "card" ? { selected: "" } : {}) }, "Kártya"),
    el("option", { value: "cash", ...(f.payment === "cash" ? { selected: "" } : {}) }, "Készpénz"));
  const selCat = el("select", { onchange: e => f.categoryId = e.target.value },
    ...db.categories.map(c => el("option", { value: c.id, ...(c.id === f.categoryId ? { selected: "" } : {}) }, c.name)));
  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("label", {}, "Üzlet"), inStore);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Egységár (Ft)"), inPrice), el("div", {}, el("label", {}, "Fizetés"), selPay)));
  wrap.append(el("label", {}, "Kategória"), selCat);
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name) { toast("Név kötelező."); return; } onSave(template.id, { name: f.name.trim(), store: f.store, lastPrice: Math.ceil(Number(f.lastPrice) || 0), categoryId: f.categoryId, payment: f.payment }); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(template) }, "Törlés"));
  return wrap;
}

// --- Utalások nézet + űrlap ---

export function renderTransfersView(state, h) {
  const { db, month } = state;
  const m = db.months[month] || { items: [], transfers: [] };
  const wrap = el("div", {});
  wrap.append(el("h2", { style: "margin-bottom:10px" }, "Pénzmozgás"));
  wrap.append(el("div", { style: "margin-bottom:12px" }, renderMonthNav(state, h)));

  const sumIn = m.transfers.filter(t => t.dir === "in").reduce((s, t) => s + t.amount, 0);
  const sumOut = m.transfers.filter(t => t.dir === "out").reduce((s, t) => s + t.amount, 0);
  const bal = sumIn - sumOut;
  const sumCard = el("div", { class: "month-total", style: "flex-direction:column;align-items:stretch;gap:6px" });
  sumCard.append(el("div", { class: "cat-head" }, el("span", { class: "mt-label" }, "Egyenleg"),
    el("span", { class: "mt-amount", style: bal >= 0 ? "color:var(--pos)" : "color:var(--neg)" }, (bal >= 0 ? "+" : "−") + ft(Math.abs(bal)))));
  sumCard.append(el("div", { class: "cat-head" }, el("span", { class: "muted" }, "Bejövő"), el("span", { class: "pos" }, "+" + ft(sumIn))));
  sumCard.append(el("div", { class: "cat-head" }, el("span", { class: "muted" }, "Kimenő"), el("span", { class: "neg" }, "−" + ft(sumOut))));
  wrap.append(sumCard);

  for (const [dir, title] of [["in", "Bejövő"], ["out", "Kimenő"]]) {
    const list = m.transfers.filter(t => t.dir === dir);
    const sum = list.reduce((s, t) => s + t.amount, 0);
    const key = "tr:" + dir;
    const open = !isCollapsed(state, key);
    const card = el("div", { class: "card" });
    card.append(el("button", { class: "collapse-head", onclick: () => h.onToggleCollapse(key) },
      el("span", { class: "left" }, chev(open), el("span", { class: "sec-title" }, title)),
      el("span", { class: "sec-sum", style: "color:" + (dir === "in" ? "var(--pos)" : "var(--neg)") }, (dir === "in" ? "+" : "−") + ft(sum))));
    if (open) {
      for (const t of list) {
        card.append(el("div", { class: "item", onclick: () => h.onEditTransfer(t.id) },
          el("div", {}, el("div", {}, t.name), el("small", {}, `${t.date || "—"} · ${t.method === "cash" ? "kp" : "utalás"} · ${t.partner || "—"}`)),
          el("div", { class: dir === "in" ? "pos" : "neg" }, (dir === "in" ? "+" : "−") + ft(t.amount))));
      }
      if (!list.length) card.append(el("div", { class: "item muted" }, "Nincs tétel"));
      card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => h.onAddTransfer(dir) }, `Új ${title.toLowerCase()}`));
    }
    wrap.append(card);
  }
  return wrap;
}

export function renderTransferForm(state, { transfer, dir, onSave, onDelete, onCancel }) {
  const v = transfer || { dir, name: "", amount: "", date: todayKey(), partner: "", note: "", method: "transfer" };
  const f = { ...v };
  if (!f.method) f.method = "transfer";
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, transfer ? "Pénzmozgás szerkesztése" : (f.dir === "in" ? "Új bevétel" : "Új kiadás")));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Megnevezés" });
  const inAmt = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount, oninput: e => f.amount = Number(e.target.value), placeholder: "Összeg (Ft)" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
  const selMethod = el("select", { onchange: e => f.method = e.target.value },
    el("option", { value: "transfer", ...(f.method === "transfer" ? { selected: "" } : {}) }, "Utalás"),
    el("option", { value: "cash", ...(f.method === "cash" ? { selected: "" } : {}) }, "Készpénz"));
  const inPartner = el("input", { value: f.partner, oninput: e => f.partner = e.target.value, placeholder: f.dir === "in" ? "Kitől" : "Kinek" });
  const inNote = el("input", { value: f.note, oninput: e => f.note = e.target.value, placeholder: "Megjegyzés" });

  if (!transfer) {
    const tpls = state.db.templates.transfers.filter(t => t.dir === f.dir);
    if (tpls.length) {
      wrap.append(el("label", {}, "Gyorslista"));
      const q = el("div", { class: "quick" });
      for (const t of tpls) q.append(el("button", { class: "ghost", onclick: () => {
        inName.value = f.name = t.name; inPartner.value = f.partner = t.partner || ""; inAmt.value = f.amount = t.lastAmount ?? "";
      } }, `+ ${t.name}`));
      wrap.append(q);
    }
  }
  wrap.append(el("label", {}, "Megnevezés"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (Ft)"), inAmt), el("div", {}, el("label", {}, "Dátum"), inDate)));
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Mód"), selMethod), el("div", {}, el("label", {}, f.dir === "in" ? "Kitől" : "Kinek"), inPartner)));
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name || !(f.amount >= 0)) { toast("Megnevezés és összeg kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (transfer && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(transfer.id) }, "Törlés"));
  return wrap;
}

// --- Áttekintő ---

export function renderOverview(state, h) {
  const wrap = el("div", {});
  const o = monthOverview(state.db, state.month);
  wrap.append(el("h2", { style: "margin-bottom:10px" }, "Áttekintő"));
  wrap.append(el("div", { style: "margin-bottom:12px" }, renderMonthNav(state, h)));
  const kpi = el("div", { class: "card" });
  kpi.append(el("div", { class: "cat-head" }, el("span", {}, "Bevétel"), el("span", { class: "pos" }, ft(o.income))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kiadás"), el("span", { class: "neg" }, ft(o.totalExpense))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px;font-weight:700" }, el("span", {}, "Egyenleg"), el("span", { class: o.balance >= 0 ? "pos" : "neg" }, ft(o.balance))));
  wrap.append(kpi);

  const cmp = monthComparison(state.db, state.month, todayKey());
  const cmpCard = el("div", { class: "card" });
  cmpCard.append(el("h3", {}, "Összehasonlítás"));
  cmpCard.append(el("div", { class: "cat-head" }, el("span", {}, "Előző hónap kiadása"), el("span", { class: "muted" }, ft(cmp.prev))));
  const dColor = cmp.delta > 0 ? "var(--neg)" : (cmp.delta < 0 ? "var(--pos)" : "var(--muted)");
  const dTxt = (cmp.delta > 0 ? "+" : "") + ft(cmp.delta) + (cmp.deltaPct !== null ? ` (${cmp.deltaPct > 0 ? "+" : ""}${cmp.deltaPct}%)` : "");
  cmpCard.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Változás"), el("span", { style: `color:${dColor};font-weight:600` }, dTxt)));
  if (cmp.projItems != null) {
    cmpCard.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Várható bolti kiadás"), el("span", { class: "muted" }, "~" + ft(cmp.projItems))));
    cmpCard.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Várható havi összes"), el("span", { class: "muted" }, "~" + ft(cmp.projTotal))));
    cmpCard.append(el("p", { class: "muted", style: "margin:4px 0 0;font-size:13px" }, "A „bolti” a napi vásárlásod előrevetítve. Az „összes” ehhez hozzáadja a kötelező/utalás kiadásokat (nem felszorozva)."));
  }
  wrap.append(cmpCard);

  const cats = el("div", { class: "card" });
  cats.append(el("h3", {}, "Kiadások kategóriánként"));
  for (const b of o.byCategory) {
    cats.append(el("div", { class: "cat-head", style: "margin-top:8px" }, el("span", {}, b.name), el("span", { class: "muted" }, `${ft(b.sum)} · ${Math.round(b.share * 100)}%`)));
    cats.append(el("div", { class: "bar" }, el("span", { style: `width:${Math.round(b.share * 100)}%` })));
  }
  wrap.append(cats);

  const pay = el("div", { class: "card" });
  pay.append(el("h3", {}, "Bolti fizetés módja"));
  pay.append(el("div", { class: "cat-head" }, el("span", {}, "Készpénz"), el("span", { class: "muted" }, ft(o.cash))));
  pay.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kártya"), el("span", { class: "muted" }, ft(o.card))));
  pay.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kimenő pénzmozgás"), el("span", { class: "muted" }, ft(o.expenseOut))));
  wrap.append(pay);

  const stats = monthStats(state.db, state.month);
  const year = state.month.slice(0, 4);
  const statCard = el("div", { class: "card" });
  statCard.append(el("h3", {}, "Statisztika"));
  if (stats.topStore) statCard.append(el("div", { class: "cat-head" }, el("span", {}, "Legtöbbet itt költöttél"), el("span", { class: "muted" }, `${stats.topStore.name} · ${ft(stats.topStore.sum)}`)));
  if (stats.biggestItem) statCard.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Legnagyobb tétel"), el("span", { class: "muted" }, `${stats.biggestItem.name} · ${ft(stats.biggestItem.price)}`)));
  statCard.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, `${year} összes kiadása`), el("span", { class: "muted" }, ft(yearTotal(state.db, year)))));
  if (!stats.topStore && !stats.biggestItem) statCard.append(el("div", { class: "muted", style: "margin-top:6px" }, "Ehhez a hónaphoz még nincs elég adat."));
  wrap.append(statCard);

  const due = dueSummaryForMonth(state.db, state.month, todayKey());
  const rem = el("div", { class: "card" });
  rem.append(el("h3", {}, "Kötelező kiadások"));
  if (!due.length) {
    rem.append(el("div", { class: "muted" }, "Nincs esedékes ebben a hónapban."));
  } else {
    const withAmount = due.filter(d => d.reminder.amount != null && d.reminder.amount !== "");
    const total = withAmount.reduce((s, d) => s + Number(d.reminder.amount), 0);
    const paidTotal = withAmount.filter(d => d.paid).reduce((s, d) => s + Number(d.reminder.amount), 0);
    rem.append(el("div", { class: "cat-head" }, el("span", {}, "Összesen"), el("span", { class: "muted" }, ft(total))));
    rem.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Ebből kifizetve"), el("span", { class: "muted" }, ft(paidTotal))));
    rem.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Hátralévő"), el("span", { style: "color:var(--neg);font-weight:600" }, ft(total - paidTotal))));
    for (const d of due) {
      const cb = el("input", { type: "checkbox", ...(d.paid ? { checked: "" } : {}), onchange: () => h.onTogglePaid(d.reminder) });
      rem.append(el("div", { class: "due-row" }, cb,
        el("div", { class: "due-main" },
          el("div", {}, d.reminder.name + (d.reminder.amount != null && d.reminder.amount !== "" ? ` — ${ft(d.reminder.amount)}` : "")),
          el("div", { class: "due-when" + (d.urgent ? " urgent" : "") }, `${fmtDay(d.date)} · ${d.paid ? "kifizetve" : dueWhenText(d.daysUntil)}`))));
    }
  }
  wrap.append(rem);
  return wrap;
}

// --- Import ---

export function renderImportView(state, { onDecode, onConfirm, onBack, onCopyPrompt, onEditRow, initialCode }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Blokk import"), el("button", { class: "ghost", onclick: onBack }, "Vissza")));

  const help = el("div", { class: "card" });
  help.append(el("label", {}, "1. lépés — beolvasás Claude-dal"));
  help.append(el("p", { class: "muted", style: "margin:0 0 8px" }, "Koppints, másold ki a beolvasó szöveget, majd a Claude appban illeszd be a blokk fotójával. A kapott választ (link vagy JSON) hozd ide."));
  if (onCopyPrompt) help.append(el("button", { class: "primary", style: "width:100%", onclick: onCopyPrompt }, "Beolvasó szöveg másolása"));
  wrap.append(help);

  const ta = el("textarea", { rows: "4", placeholder: "2. lépés — illeszd be ide a Claude válaszát (link vagy JSON)" }, initialCode || "");
  wrap.append(el("div", { class: "card" }, ta, el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => onDecode(ta.value) }, "Beolvasás")));

  if (state.importPreview) {
    const p = state.importPreview;
    const box = el("div", { class: "card" });
    box.append(el("h3", {}, `${p.rows.length} tétel — ${monthLabel(p.month)}`));
    box.append(el("p", { class: "muted", style: "margin:0 0 8px" }, "Tipp: tartsd nyomva egy tétel nevét a név/üzlet javításához."));
    p.rows.forEach((r, idx) => {
      const sel = el("select", { onchange: e => r.categoryId = e.target.value }, ...db.categories.map(c => el("option", { value: c.id, ...(c.id === r.categoryId ? { selected: "" } : {}) }, c.name)));
      const nameEl = el("div", { class: "editable-name" }, `${r.name} — ${ft(r.price)}`);
      if (onEditRow) attachLongPress(nameEl, () => onEditRow(idx));
      box.append(el("div", { class: "item" },
        el("div", {}, nameEl, el("small", {}, `${r.qty} db · ${r.store || "—"} · ${r.payment === "cash" ? "kp" : "kártya"}`)),
        sel));
    });
    box.append(el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: onConfirm }, "Hozzáadás a hónaphoz"));
    wrap.append(box);
  }
  return wrap;
}

// --- Emlékeztetők ---

export function renderReminderForm(state, { reminder, onSave, onDelete, onCancel }) {
  const v = reminder || { name: "", amount: "", note: "", active: true, freq: "monthly", interval: 1, startDate: todayKey(), until: "", notify: true, notifyTime: "09:00" };
  const f = { ...v };
  if (f.notify === undefined) f.notify = true;
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, reminder ? "Emlékeztető szerkesztése" : "Új emlékeztető"));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Név (pl. Törlesztő)" });
  const inAmount = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount ?? "", oninput: e => f.amount = e.target.value === "" ? null : Number(e.target.value), placeholder: "Összeg (opcionális)" });
  const inNote = el("input", { value: f.note, oninput: e => f.note = e.target.value, placeholder: "Megjegyzés" });
  const selFreq = el("select", { onchange: e => { f.freq = e.target.value; repBox.style.display = f.freq === "none" ? "none" : ""; } },
    ...[["none", "Egyszeri (nem ismétlődik)"], ["monthly", "Havonta"], ["weekly", "Hetente"], ["daily", "Naponta"]].map(([val, lab]) => el("option", { value: val, ...(f.freq === val ? { selected: "" } : {}) }, lab)));
  const inInterval = el("input", { type: "number", inputmode: "numeric", min: "1", value: f.interval, oninput: e => f.interval = Math.max(1, Number(e.target.value) || 1) });
  const inStart = el("input", { type: "date", value: f.startDate, oninput: e => f.startDate = e.target.value });
  const inUntil = el("input", { type: "date", value: f.until || "", oninput: e => f.until = e.target.value || null });
  const inTime = el("input", { type: "time", value: f.notifyTime, oninput: e => f.notifyTime = e.target.value });
  const inActive = el("select", { onchange: e => f.active = e.target.value === "yes" },
    el("option", { value: "yes", ...(f.active ? { selected: "" } : {}) }, "Aktív"),
    el("option", { value: "no", ...(!f.active ? { selected: "" } : {}) }, "Kikapcsolva"));
  const cbNotify = el("input", { type: "checkbox", ...(f.notify ? { checked: "" } : {}), onchange: e => { f.notify = e.target.checked; timeBox.style.display = f.notify ? "" : "none"; } });

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (opcionális)"), inAmount), el("div", {}, el("label", {}, "Állapot"), inActive)));
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Ismétlődés"), selFreq), el("div", {}, el("label", {}, "Kezdő dátum"), inStart)));
  const repBox = el("div", { class: "row", style: f.freq === "none" ? "display:none" : "" },
    el("div", {}, el("label", {}, "Gyakoriság (pl. 2 = kéthavonta)"), inInterval),
    el("div", {}, el("label", {}, "Lejárat (opcionális)"), inUntil));
  wrap.append(repBox);
  wrap.append(el("label", { style: "display:flex;align-items:center;gap:10px;margin-top:10px;color:var(--fg)" }, cbNotify, el("span", {}, "Értesítést kérek (a nap reggelén)")));
  const timeBox = el("div", { style: f.notify ? "" : "display:none" }, el("label", {}, "Értesítés ideje"), inTime);
  wrap.append(timeBox);

  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name) { toast("Név kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (reminder && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(reminder.id) }, "Törlés"));
  return wrap;
}

export function renderRemindersView(state, h) {
  const { db, month } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Kötelező kiadások"), el("button", { class: "primary", onclick: h.onAddReminder }, "Új")));
  if (!db.reminders.length) wrap.append(el("div", { class: "card muted" }, "Még nincs emlékeztető. Vedd fel a rendszeres kötelező kiadásaidat (törlesztő, TB, hitel…)."));
  for (const r of db.reminders) {
    const dates = occurrencesInMonth(r, month);
    const paid = (db.months[month]?.paidReminders || []).includes(r.id);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" },
      el("span", {}, r.name + (r.active ? "" : " (kikapcsolva)")),
      el("span", { class: "muted" }, r.amount != null && r.amount !== "" ? ft(r.amount) : "—")));
    card.append(el("div", { class: "muted", style: "margin:4px 0" },
      `${FREQ_LABEL[r.freq]}${r.interval > 1 ? ` /${r.interval}` : ""}` + (dates.length ? ` · e havi esedékesség: ${dates.join(", ")}` : " · nincs e havi esedékesség")));
    const row = el("div", { class: "row" });
    row.append(el("button", { class: paid ? "" : "primary", onclick: () => h.onTogglePaid(r) }, paid ? "Kifizetve ✓ (visszavon)" : "Kifizetve"));
    row.append(el("button", { class: "ghost", onclick: () => h.onAddToCalendar(r) }, "Naptárba"));
    card.append(row);
    card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => h.onEditReminder(r.id) }, "Szerkesztés"));
    wrap.append(card);
  }
  return wrap;
}

// --- Visszaállítás ---

export function renderRestoreView(state, h) {
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Visszaállítás"), el("button", { class: "ghost", onclick: h.onBack }, "Vissza")));

  const snaps = listBackups();
  const auto = el("div", { class: "card" });
  auto.append(el("label", {}, "Automatikus mentések (a telón)"));
  if (!snaps.length) {
    auto.append(el("div", { class: "muted" }, "Még nincs automatikus mentés. Hetente egy készül, amikor megnyitod az appot."));
  } else {
    snaps.forEach((s, i) => {
      auto.append(el("div", { class: "item" },
        el("div", {}, el("div", {}, s.date), el("small", {}, itemsCount(s.data))),
        el("button", { class: "ghost", onclick: () => h.onRestoreSnapshot(i) }, "Visszaállítás")));
    });
  }
  wrap.append(auto);

  const file = el("div", { class: "card" });
  file.append(el("label", {}, "Visszaállítás fájlból"));
  file.append(el("button", { class: "primary", style: "width:100%", onclick: h.onRestoreFile }, "Fájl kiválasztása"));
  wrap.append(file);

  wrap.append(el("div", { class: "card", style: "border-color:var(--accent)" },
    el("strong", {}, "Fontos"),
    el("p", { class: "muted", style: "margin:6px 0 0" }, "A telón tárolt mentések elveszhetnek, ha a telefon adata törlődik vagy elveszik a telefon. Ezért havonta egyszer a „Biztonsági mentés fájlba” gombbal ments ki egy fájlt is, és tedd felhőbe vagy más biztos helyre.")));
  return wrap;
}

function itemsCount(db) {
  let items = 0, transfers = 0;
  for (const m of Object.values(db.months || {})) { items += (m.items || []).length; transfers += (m.transfers || []).length; }
  return `${items} tétel · ${transfers} utalás · ${(db.reminders || []).length} emlékeztető`;
}

// --- Beállítások ---

export function renderSettings(state, h) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("h2", {}, "Beállítások"));
  const b = (label, fn, cls = "") => el("button", { class: cls, style: "width:100%;margin-bottom:8px", onclick: fn }, label);

  // 1) Kezelés (legfelül)
  const linksCard = el("div", { class: "card" });
  linksCard.append(el("label", {}, "Kezelés"),
    b("Hogyan használd (súgó)", h.onOpenHelp, "primary"),
    b("Kötelező kiadások / emlékeztetők", h.onOpenReminders),
    b("Kategóriák kezelése", h.onManageCategories),
    b("Elmentett tételek", h.onOpenTemplates),
    b("Blokk import", h.onOpenImportView));
  wrap.append(linksCard);

  // 2) Értesítések (a Kezelés alatt)
  const notifCard = el("div", { class: "card" });
  notifCard.append(el("div", { class: "cat-head" }, el("span", {}, "Értesítések (esedékes kötelező kiadások)"), el("span", { class: "muted" }, db.settings.notifications ? "Be" : "Ki")));
  notifCard.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: h.onToggleNotifications }, db.settings.notifications ? "Kikapcsolás" : "Bekapcsolás"));
  notifCard.append(el("p", { class: "muted" }, "Helyi értesítés az app nyitásakor. Zárt appnál is szóló riasztáshoz használd az emlékeztetőnél a „Naptárba” gombot."));
  wrap.append(notifCard);

  // 3) Kinézet: téma, szín, betűméret
  const themeCard = el("div", { class: "card" });
  themeCard.append(el("label", {}, "Téma"));
  themeCard.append(el("select", { onchange: e => h.onSetTheme(e.target.value) },
    ...[["system", "Rendszer szerint"], ["dark", "Sötét"], ["light", "Világos"]].map(([vv, l]) => el("option", { value: vv, ...(db.settings.theme === vv ? { selected: "" } : {}) }, l))));
  wrap.append(themeCard);

  const accentCard = el("div", { class: "card" });
  accentCard.append(el("label", {}, "Kiemelő szín"));
  const sw = el("div", { class: "swatches" });
  for (const [key, a] of Object.entries(ACCENTS)) {
    sw.append(el("button", {
      class: "swatch" + (db.settings.accent === key ? " sel" : ""),
      style: `background:${a.hex}`, "aria-label": a.label, title: a.label,
      onclick: () => h.onSetAccent(key),
    }));
  }
  accentCard.append(sw);
  wrap.append(accentCard);

  const fsCard = el("div", { class: "card" });
  fsCard.append(el("label", {}, "Betűméret"));
  fsCard.append(el("select", { onchange: e => h.onSetFontScale(e.target.value) },
    ...[["small", "Kicsi"], ["normal", "Normál"], ["large", "Nagy"]].map(([v, l]) => el("option", { value: v, ...(db.settings.fontScale === v ? { selected: "" } : {}) }, l))));
  wrap.append(fsCard);

  // 4) Fontos figyelmeztetés — közvetlenül a biztonsági mentés fölé
  wrap.append(el("div", { class: "warn-card" },
    el("span", { class: "warn-title" }, "Fontos — mentsd az adataidat!"),
    el("p", {}, "Az összes adatod és a telón tárolt automatikus mentések a TELEFONODON vannak. Ha törlöd a böngésző adatait, alaphelyzetbe állítod a telót, vagy az iPhone felszabadítja a helyet, MINDEN elveszhet. Ezért havonta egyszer nyomd meg lent a „Biztonsági mentés fájlba” gombot, és tedd a fájlt felhőbe vagy más biztos helyre.")));

  // 5) Biztonsági mentés + Excel
  const safeCard = el("div", { class: "card" });
  safeCard.append(el("label", {}, "Biztonsági mentés (hogy ne vesszen el)"),
    b("Biztonsági mentés fájlba", h.onBackup, "primary"),
    b("Visszaállítás mentésből", h.onOpenRestore),
    el("p", { class: "muted", style: "margin:4px 0 0" }, "Ezt tedd el havonta (felhőbe vagy emailbe küldve) — EBBŐL állítható vissza minden az appban."));
  wrap.append(safeCard);

  const xlsCard = el("div", { class: "card" });
  xlsCard.append(el("label", {}, "Excel táblázat (megnézni / nyomtatni)"),
    b("Excel – ez a hónap", h.onExportMonth),
    b("Excel – minden hónap", h.onExportAll),
    el("p", { class: "muted", style: "margin:4px 0 0" }, "Táblázat, amit Excelben nyitsz meg. Ez NEM visszaállításra való — arra a fenti biztonsági mentés."));
  wrap.append(xlsCard);

  // 6) Verzió (legalul)
  const verCard = el("div", { class: "card" });
  verCard.append(el("button", { class: "ver-box", onclick: h.onShowChangelog },
    el("span", { class: "v" }, `Verzió ${APP_VERSION} · ${APP_DATE}`),
    el("span", { class: "go" }, "Mi újult meg? →")));
  wrap.append(verCard);
  return wrap;
}
