import { monthOverview, categoryTotal, remindersDueInMonth, occurrencesInMonth, dueSummaryForMonth, todayKey, monthComparison, monthStats, yearTotals, yearStats,
  filterRange, dateBounds, hasActiveFilters, isCrossMonth, collectItems } from "./model.js";
import { ACCENTS } from "./theme.js";
import { toast } from "./dialog.js";
import { APP_VERSION, APP_DATE } from "./version.js";
import { listBackups } from "./storage.js";

const YEARS = Array.from({ length: 2100 - 2025 + 1 }, (_, i) => 2025 + i);
const MONTH_SHORT = ["jan.", "feb.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

export function isCollapsed(state, key) { return !!(state.db.settings.collapsed && state.db.settings.collapsed[key]); }
// Lecsukható test: a fejléc-kattintás HELYBEN nyit/csuk (CSS animálja a magasságot),
// az oldal nem rajzolódik újra. onPersist(collapsed) menti el az állapotot.
function collapsibleBody(open, inner, chevEl, onPersist) {
  const body = el("div", { class: "col" + (open ? " open" : "") }, el("div", { class: "col-inner" }, inner));
  const toggle = () => {
    const isOpen = body.classList.toggle("open");
    if (chevEl) chevEl.classList.toggle("open", isOpen);
    if (onPersist) onPersist(!isOpen);
  };
  return { body, toggle };
}
function chev(open) { return el("span", { class: "chev" + (open ? " open" : "") }, "▸"); }

const CAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

const FILTER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';

// Keresősáv: törlő X, mellette vagy naptár-ikon (dátumra szűrés), vagy szűrő-gomb.
// onInput(érték, { noFocus }) — koppintós művelet után nem kérjük vissza a billentyűzetet.
function searchRow(id, value, placeholder, onInput, opts = {}) {
  const input = el("input", { id, class: "search-input", value: value || "", placeholder,
    oninput: e => onInput(e.target.value) });
  const actions = el("div", { class: "sr-actions" });
  if (value) {
    actions.append(el("button", { class: "sr-btn sr-clear", type: "button", "aria-label": "Keresés törlése",
      onclick: () => onInput("", { noFocus: true }) }, "×"));
  }
  if (opts.onOpenFilter) {
    const btn = el("button", { class: "sr-btn sr-filter" + (opts.filterCount ? " on" : ""), type: "button",
      "aria-label": "Szűrők", title: "Szűrők", onclick: opts.onOpenFilter });
    btn.insertAdjacentHTML("afterbegin", FILTER_SVG);
    if (opts.filterCount) btn.append(el("span", { class: "sr-badge" }, String(opts.filterCount)));
    actions.append(btn);
  } else {
    // A dátum-mező átlátszóan az ikon fölött ül: koppintásra a telefon saját naptára nyílik.
    const dateInput = el("input", { type: "date", class: "sr-date", "aria-label": "Keresés dátum szerint",
      value: /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "",
      onchange: e => { if (e.target.value) onInput(e.target.value, { noFocus: true }); } });
    const calBtn = el("span", { class: "sr-btn sr-cal", title: "Keresés dátum szerint" }, dateInput);
    calBtn.insertAdjacentHTML("afterbegin", CAL_SVG);
    actions.append(calBtn);
  }
  return el("div", { class: "search-row" }, input, actions);
}

// Aktív szűrők felsorolása a keresősáv alatt. Az EGÉSZ címkére koppintva törlődik az adott szűrő.
function renderFilterChips(state, h) {
  const { filters: f } = state;
  const { maxPrice } = filterRange(state.db);
  const chips = [];
  const catName = id => (state.db.categories.find(c => c.id === id) || {}).name || "?";
  for (const s of f.stores || []) chips.push({ label: s, onClear: () => h.onToggleFilterValue("stores", s) });
  for (const id of f.categoryIds || []) chips.push({ label: catName(id), onClear: () => h.onToggleFilterValue("categoryIds", id) });
  for (const p of f.payments || []) chips.push({ label: p === "cash" ? "készpénz" : "kártya", onClear: () => h.onToggleFilterValue("payments", p) });
  const b = dateBounds(f);
  if (b.from || b.to) {
    const lbl = b.from && b.to ? (b.from === b.to ? fmtFullDay(b.from) : `${fmtFullDay(b.from)} – ${fmtFullDay(b.to)}`)
      : (b.from ? `${fmtFullDay(b.from)}-től` : `${fmtFullDay(b.to)}-ig`);
    chips.push({ label: lbl, onClear: () => h.onClearFilterDate() });
  }
  if (f.min != null && f.min > 0) chips.push({ label: `${ft(f.min)}-tól`, onClear: () => h.onSetFilterPrice(0, f.max) });
  if (f.max != null && f.max < maxPrice) chips.push({ label: `${ft(f.max)}-ig`, onClear: () => h.onSetFilterPrice(f.min, maxPrice) });
  if (!chips.length) return null;
  const row = el("div", { class: "chips" });
  for (const c of chips) {
    row.append(el("button", { class: "chip", type: "button", title: "Szűrő törlése", onclick: c.onClear },
      el("span", {}, c.label), el("span", { class: "chip-x" }, "×")));
  }
  row.append(el("button", { class: "chip chip-all", type: "button", onclick: h.onClearFilters }, "Mind törlése"));
  return row;
}

function fmtFullDay(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}.`;
}

// Szűrő-panel tartalma. Minden szakasz külön lecsukható; a változás azonnal érvényes.
// A redraw() a panelt rajzolja újra helyben (a lista a panel bezárásakor frissül).
export function renderFilterPanel(state, h, redraw, onApply) {
  const f = state.filters;
  const { stores, maxPrice } = filterRange(state.db);
  const cats = state.db.categories.slice().sort((a, b) => a.order - b.order);
  const wrap = el("div", { class: "fp" });

  // Egy lecsukható szakasz. A fejlécben a jelenlegi választás összefoglalója látszik.
  const section = (key, title, summary, buildBody) => {
    const open = !!state.filterOpen[key];
    const box = el("div", { class: "fp-sec" });
    const chevEl = el("span", { class: "chev" + (open ? " open" : "") }, "▸");
    const { body, toggle } = collapsibleBody(open, buildBody(), chevEl, (collapsed) => { state.filterOpen[key] = !collapsed; });
    box.append(el("button", { class: "fp-head", type: "button", onclick: toggle },
      el("span", { class: "left" }, chevEl, el("span", { class: "fp-title" }, title)),
      el("span", { class: "fp-sum" }, summary)));
    box.append(body);
    wrap.append(box);
  };

  // Több választás egy szűrőn belül; legfelül az „Összes" (= nincs szűrés erre).
  const multi = (field, options, labelOf) => {
    const sel = f[field] || [];
    const list = el("div", { class: "fp-list" });
    list.append(el("button", { class: "fp-opt" + (sel.length ? "" : " sel"), type: "button",
      onclick: () => { f[field] = []; redraw(); } }, "Összes"));
    for (const v of options) {
      const on = sel.includes(v);
      list.append(el("button", { class: "fp-opt" + (on ? " sel" : ""), type: "button",
        onclick: () => { h.onToggleFilterValue(field, v); redraw(); } },
        el("span", {}, labelOf ? labelOf(v) : v), el("span", { class: "fp-tick" }, on ? "✓" : "")));
    }
    return list;
  };

  const nameOf = id => (cats.find(c => c.id === id) || {}).name || "?";
  section("store", "Üzlet", (f.stores || []).length ? f.stores.join(", ") : "Összes",
    () => stores.length ? multi("stores", stores) : el("div", { class: "muted", style: "padding:0.25rem 0 0.5rem" }, "Még nincs üzlet a tételeknél."));
  section("cat", "Kategória", (f.categoryIds || []).length ? f.categoryIds.map(nameOf).join(", ") : "Összes",
    () => multi("categoryIds", cats.map(c => c.id), nameOf));
  section("pay", "Fizetés", (f.payments || []).length ? f.payments.map(p => p === "cash" ? "készpénz" : "kártya").join(", ") : "Összes",
    () => multi("payments", ["card", "cash"], p => p === "cash" ? "Készpénz" : "Kártya"));

  const b = dateBounds(f);
  const dateSummary = b.from || b.to
    ? (b.from === b.to ? fmtFullDay(b.from) : `${b.from ? fmtFullDay(b.from) : "…"} – ${b.to ? fmtFullDay(b.to) : "…"}`)
    : "Összes";
  section("date", "Dátum", dateSummary, () => {
    const body = el("div", {});
    const modeRow = el("div", { class: "fp-list", style: "flex-direction:row;gap:0.375rem" });
    for (const [val, lab] of [["day", "Egy nap"], ["range", "Időszak"]]) {
      modeRow.append(el("button", { class: "fp-opt" + (f.dateMode === val ? " sel" : ""), type: "button",
        style: "flex:1;justify-content:center", onclick: () => { f.dateMode = val; redraw(); } }, lab));
    }
    body.append(modeRow);
    if (f.dateMode === "range") {
      body.append(el("div", { class: "row" },
        el("div", {}, el("label", {}, "Ettől"), el("input", { type: "date", value: f.from || "", onchange: e => { f.from = e.target.value; redraw(); } })),
        el("div", {}, el("label", {}, "Eddig"), el("input", { type: "date", value: f.to || "", onchange: e => { f.to = e.target.value; redraw(); } }))));
    } else {
      body.append(el("label", {}, "Nap"));
      body.append(el("input", { type: "date", value: f.day || "", onchange: e => { f.day = e.target.value; redraw(); } }));
    }
    if (b.from || b.to) body.append(el("button", { class: "ghost", style: "width:100%;margin-top:0.25rem", onclick: () => { h.onClearFilterDate(); redraw(); } }, "Dátum-szűrő törlése"));
    return body;
  });

  const min = f.min ?? 0, max = f.max ?? maxPrice;
  const priceSummary = maxPrice === 0 ? "—" : (min > 0 || max < maxPrice) ? `${ft(min)} – ${ft(max)}` : "Összes";
  section("price", "Összeg", priceSummary, () => {
    const body = el("div", {});
    if (maxPrice === 0) { body.append(el("div", { class: "muted", style: "padding:0.25rem 0 0.5rem" }, "Még nincs tétel, amiből sávot képezhetnék.")); return body; }
    // Felül a beírható Ft-tól/Ft-ig, alatta EGY sáv két fogantyúval.
    const nMin = el("input", { type: "number", inputmode: "numeric", min: "0", max: String(maxPrice), value: String(min) });
    const nMax = el("input", { type: "number", inputmode: "numeric", min: "0", max: String(maxPrice), value: String(max) });
    body.append(el("div", { class: "row" },
      el("div", {}, el("label", {}, "Ft-tól"), nMin), el("div", {}, el("label", {}, "Ft-ig"), nMax)));
    const apply = (lo, hi) => { h.onSetFilterPrice(lo, hi); redraw(); };
    nMin.onchange = () => apply(Math.max(0, Math.min(Number(nMin.value) || 0, max)), max);
    nMax.onchange = () => apply(min, Math.min(maxPrice, Math.max(Number(nMax.value) || 0, min)));
    const fill = el("div", { class: "dr-fill" });
    const rMin = el("input", { type: "range", class: "dr-thumb", min: "0", max: String(maxPrice), step: "1", value: String(min) });
    const rMax = el("input", { type: "range", class: "dr-thumb", min: "0", max: String(maxPrice), step: "1", value: String(max) });
    const paint = () => {
      const lo = Number(rMin.value), hi = Number(rMax.value);
      fill.style.left = (lo / maxPrice * 100) + "%";
      fill.style.right = (100 - hi / maxPrice * 100) + "%";
      nMin.value = String(lo); nMax.value = String(hi);
      // Ha mindkét fogantyú a jobb szélen áll, az alsó legyen felül, hogy vissza lehessen húzni.
      rMin.style.zIndex = lo >= maxPrice ? 5 : 3;
    };
    // Húzás közben csak rajzolunk; a szűrő elengedéskor (change) frissül — nem szakad meg a húzás.
    rMin.oninput = () => { if (Number(rMin.value) > Number(rMax.value)) rMin.value = rMax.value; paint(); };
    rMax.oninput = () => { if (Number(rMax.value) < Number(rMin.value)) rMax.value = rMin.value; paint(); };
    rMin.onchange = () => apply(Number(rMin.value), Number(rMax.value));
    rMax.onchange = () => apply(Number(rMin.value), Number(rMax.value));
    const track = el("div", { class: "dual-range" }, fill, rMin, rMax);
    rMax.style.zIndex = 4;
    paint();
    body.append(track);
    if (min > 0 || max < maxPrice) body.append(el("button", { class: "ghost", style: "width:100%;margin-top:0.5rem", onclick: () => apply(0, maxPrice) }, "Összeg-szűrő törlése"));
    return body;
  });

  wrap.append(el("button", { class: "primary", style: "width:100%;margin-top:0.75rem",
    onclick: onApply }, "Szűrés"));
  if (hasActiveFilters(f, maxPrice)) {
    wrap.append(el("button", { class: "ghost", style: "width:100%;margin-top:0.5rem;color:var(--neg)",
      onclick: () => { h.onClearFilters(); redraw(); } }, "Minden szűrő törlése"));
  }
  return wrap;
}

// Kereséshez: a dátum több írásmódja, hogy „08-04", „aug", „augusztus" és „4." is találjon.
function dateSearchText(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return String(dateKey);
  return `${dateKey} ${MONTHS[m - 1]} ${MONTH_SHORT[m - 1]} ${d}. ${String(d).padStart(2, "0")}.`;
}

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
export function renderMonthNav(state, h, short = false) {
  const [y, m] = state.month.split("-").map(Number);
  const names = short ? MONTH_SHORT : MONTHS;
  const ySel = el("select", { "aria-label": "Év", onchange: e => h.onSetMonth(`${e.target.value}-${String(m).padStart(2, "0")}`) },
    ...YEARS.map(yy => el("option", { value: yy, ...(yy === y ? { selected: "" } : {}) }, String(yy))));
  const mSel = el("select", { "aria-label": "Hónap", onchange: e => h.onSetMonth(`${y}-${e.target.value}`) },
    ...names.map((name, i) => { const val = String(i + 1).padStart(2, "0"); return el("option", { value: val, ...(i + 1 === m ? { selected: "" } : {}) }, name); }));
  return el("div", { class: "month-nav" },
    el("button", { class: "ghost", "aria-label": "Előző hónap", onclick: h.onPrevMonth }, "‹"),
    ySel, mSel,
    el("button", { class: "ghost", "aria-label": "Következő hónap", onclick: h.onNextMonth }, "›"));
}

// Oldalfejléc: a cím és a hónapváltó egy sorban, finom kiemelő kerettel.
export function renderPageHead(state, h, title) {
  return el("div", { class: "page-head" },
    el("span", { class: "page-title" }, title),
    renderMonthNav(state, h, true));
}

// Fix, felül megjelenő kötelező kiadások — checkboxszal, esedékességgel, sürgős piros jelöléssel
export function renderRemindersPinned(state, h) {
  const due = dueSummaryForMonth(state.db, state.month, todayKey());
  if (!due.length) return null;
  const open = !isCollapsed(state, "rem");
  const unpaid = due.filter(d => !d.paid).length;
  const card = el("div", { class: "card", style: "border-color:var(--accent)" });
  const chevEl = chev(open);
  const inner = el("div", {});
  for (const d of due) {
    const cb = el("input", { type: "checkbox", ...(d.paid ? { checked: "" } : {}), onchange: () => h.onTogglePaid(d.reminder) });
    inner.append(el("div", { class: "due-row" }, cb,
      el("div", { class: "due-main" },
        el("div", {}, d.reminder.name + (d.reminder.amount != null && d.reminder.amount !== "" ? ` — ${ft(d.reminder.amount)}` : "")),
        el("div", { class: "due-when" + (d.urgent ? " urgent" : "") }, `${fmtDay(d.date)} · ${d.paid ? "kifizetve" : dueWhenText(d.daysUntil)}`))));
  }
  const { body, toggle } = collapsibleBody(open, inner, chevEl, (collapsed) => h.onSetCollapsed("rem", collapsed));
  card.append(el("button", { class: "collapse-head", onclick: toggle },
    el("span", { class: "left" }, chevEl, el("span", { class: "sec-title" }, "Kötelező kiadások")),
    el("span", { class: "sec-sum" }, unpaid ? `${unpaid} hátra` : "kész")));
  card.append(body);
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

function importDateLabel(key) {
  const [y, m, d] = key.split("-");
  return `${y}. ${MONTHS[Number(m) - 1]} ${d}.`;
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

// A címkét pontosan a rendelkezésre álló szélességre rövidíti, egy ponttal a végén.
function fitLabel(lbl, full) {
  lbl.textContent = full;
  let s = full, guard = 0;
  while (lbl.scrollWidth > lbl.clientWidth && s.length > 1 && guard++ < 60) {
    s = s.slice(0, -1);
    lbl.textContent = s + ".";
  }
}

export function findCategoryIdByName(db, name) {
  const c = db.categories.find(x => x.name.toLowerCase() === String(name || "").toLowerCase());
  return c ? c.id : null;
}

const FREQ_LABEL = { none: "egyszeri", daily: "napi", weekly: "heti", monthly: "havi" };

// --- Hónap nézet ---

// filtered: { sum, count } ha épp szűrés/keresés van érvényben — ilyenkor a szűrt
// összeg az elsődleges, de lenyitva továbbra is átállítható a havi/bolti értékre.
function renderMonthTotal(state, h, filtered) {
  const o = monthOverview(state.db, state.month);
  const total = o.totalExpense, items = o.expenseItems;
  if (!filtered && o.expenseOut <= 0) {
    return el("div", { class: "month-total" }, el("span", { class: "mt-label" }, "Havi kiadás"), el("span", { class: "mt-amount" }, ft(total)));
  }
  const saved = state.db.settings.monthTotalMode === "items" ? "items" : "total";
  // Szűréskor alapból a szűrt összeg, de a munkamenetre felülbírálható.
  const mode = filtered ? (state.filterTotalMode || "filtered") : saved;
  const vals = { total, items, filtered: filtered ? filtered.sum : 0 };
  const labels = { total: "Havi összes", items: "Csak bolti (pénzmozgás nélkül)",
    filtered: filtered ? `Szűrt tételek (${filtered.count} db)` : "Szűrt tételek" };
  const open = state.monthTotalOpen;
  const box = el("div", { class: "month-total stack" + (filtered && mode === "filtered" ? " filtered" : "") });
  const chevEl = el("span", { class: "chev-sm" + (open ? " open" : "") }, "▸");
  const inner = el("div", {});
  const opt = (m) => el("button", { class: "mt-opt" + (mode === m ? " sel" : ""),
    onclick: () => h.onSetMonthTotalMode(m, !!filtered) },
    el("span", {}, labels[m]), el("span", { class: "v" }, ft(vals[m])));
  if (filtered) inner.append(opt("filtered"));
  inner.append(opt("total"));
  inner.append(opt("items"));
  const { body, toggle } = collapsibleBody(open, inner, chevEl, (collapsed) => { state.monthTotalOpen = !collapsed; });
  box.append(el("button", { class: "mt-head", onclick: toggle },
    el("span", { class: "mt-label" }, labels[mode]),
    el("span", { class: "right" }, el("span", { class: "mt-amount" }, ft(vals[mode])), chevEl)));
  box.append(body);
  return box;
}

export function renderMonthView(state, h) {
  const { db, month } = state;
  const wrap = el("div");

  wrap.append(renderPageHead(state, h, "Kiadások"));

  const pinned = renderRemindersPinned(state, h); if (pinned) wrap.append(pinned);

  const q = (state.search || "").trim().toLowerCase();
  const { maxPrice } = filterRange(db);
  const filtering = !!q || hasActiveFilters(state.filters, maxPrice);
  const activeCount = filterActiveCount(state, maxPrice);
  const sr = searchRow("kiadas-search", state.search || "", "Keresés (név, üzlet vagy dátum)", h.onSearchInput,
    { onOpenFilter: h.onOpenFilters, filterCount: activeCount });
  sr.style.margin = "10px 0 8px";
  wrap.append(sr);
  const chips = renderFilterChips(state, h); if (chips) wrap.append(chips);
  wrap.append(el("button", { class: "primary", onclick: h.onAddItem, style: "width:100%;margin:0 0 10px" }, "Új tétel"));

  // A szűrőn/keresésen átment tételek (dátum-szűrésnél több hónapból is).
  const matchText = it => (it.name + " " + (it.store || "") + " " + dateSearchText(it.date)).toLowerCase();
  let shown = collectItems(db, month, state.filters, maxPrice);
  if (q) shown = shown.filter(it => matchText(it).includes(q));
  const shownSum = Math.round(shown.reduce((sum, it) => sum + it.price, 0));
  const cross = isCrossMonth(state.filters);

  wrap.append(renderMonthTotal(state, h, filtering ? { sum: shownSum, count: shown.length } : null));

  const m = db.months[month] || { items: [], transfers: [] };
  if (!filtering && m.items.length === 0) {
    wrap.append(el("div", { class: "empty-hint" },
      el("strong", {}, "Még nincs tétel ebben a hónapban"),
      el("div", { class: "muted" }, "Vedd fel az elsőt az „Új tétel” gombbal, vagy olvass be egy blokkot: Beállítások → Blokk bevitel.")));
  }
  let shownAny = false;
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    const items = shown.filter(i => i.categoryId === c.id);
    if (filtering && !items.length) continue;
    shownAny = true;
    const key = "cat:" + c.id;
    const open = filtering ? true : !isCollapsed(state, key);
    // Szűréskor a szűrt tételek összege látszik; egyébként a havi kategória-összeg (kerettel).
    const total = filtering ? Math.round(items.reduce((sum, i) => sum + i.price, 0)) : categoryTotal(db, month, c.id);
    const over = !filtering && c.budget && total > c.budget;
    const card = el("div", { class: "card" });
    const chevEl = chev(open);
    const inner = el("div", {});
    for (const it of items) {
      // Több hónapra szűrve a dátum is kell, különben nem tudnád, melyik hónapból jött.
      const meta = `${it.qty} db · ${it.store || "—"} · ${it.payment === "cash" ? "kp" : "kártya"}` +
        (cross && it.date ? ` · ${it.date}` : "");
      inner.append(el("div", { class: "item", onclick: () => h.onEditItem(it.id, it.monthKey) },
        el("div", {}, el("div", {}, it.name), el("small", {}, meta)),
        el("div", {}, ft(it.price))));
    }
    if (!items.length) inner.append(el("div", { class: "item muted" }, "Nincs tétel"));
    const { body, toggle } = collapsibleBody(open, inner, chevEl, (collapsed) => h.onSetCollapsed(key, collapsed));
    card.append(el("button", { class: "collapse-head", onclick: toggle },
      el("span", { class: "left" }, chevEl, el("span", { class: "sec-title" }, c.name)),
      el("span", { class: "sec-sum", style: over ? "color:var(--neg)" : "" },
        (!filtering && c.budget) ? `${ft(total)} / ${ft(c.budget)}` : ft(total))));
    if (!filtering && c.budget) {
      const pct = Math.min(100, Math.round((total / c.budget) * 100));
      card.append(el("div", { class: "bar" }, el("span", { style: `width:${pct}%` + (over ? ";background:var(--neg)" : "") })));
    }
    card.append(body);
    wrap.append(card);
  }
  if (filtering && !shownAny) wrap.append(el("div", { class: "card muted" }, "Nincs találat."));
  return wrap;
}

// Hány szűrő van bekapcsolva? (a jelvényhez a keresősáv szűrő-gombján)
function filterActiveCount(state, maxPrice) {
  const f = state.filters; if (!f) return 0;
  let n = (f.stores || []).length + (f.categoryIds || []).length + (f.payments || []).length;
  const b = dateBounds(f); if (b.from || b.to) n++;
  if (f.min != null && f.min > 0) n++;
  if (f.max != null && f.max < maxPrice) n++;
  return n;
}

// --- Tétel űrlap ---

// Összecsukható, kereshető gyorslista a mentett tételekhez/pénzmozgásokhoz.
// entries: [{ name, onPick }] — a [fejléc, tartalom] elempárt adja vissza.
function quickListBox(entries) {
  const chevSpan = el("span", { class: "chev" }, "▸");
  const header = el("button", { class: "collapse-head", type: "button" },
    el("span", { class: "left" }, chevSpan, el("span", { class: "sec-title", style: "font-size:1rem" }, `Gyorslista (${entries.length})`)));
  const search = el("input", { placeholder: "Keresés a mentettek közt", style: "margin-bottom:8px" });
  const quick = el("div", { class: "quick" });
  for (const e of entries) {
    quick.append(el("button", { class: "ghost", type: "button", "data-name": e.name.toLowerCase(), onclick: e.onPick }, `+ ${e.name}`));
  }
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    for (const btn of quick.children) btn.style.display = (!q || btn.getAttribute("data-name").includes(q)) ? "" : "none";
  };
  const { body, toggle } = collapsibleBody(false, el("div", {}, search, quick), chevSpan, null);
  header.onclick = toggle;
  return [header, body];
}

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
    wrap.append(...quickListBox(templates.map(t => ({ name: t.name, onPick: () => {
      inName.value = f.name = t.name;
      inStore.value = f.store = t.store || "";
      inQty.value = f.qty = t.lastQty ?? 1;
      inPrice.value = f.price = t.lastPrice ?? "";
      f.unit = t.lastPrice ?? 0;
      selPay.value = f.payment = t.payment || "card";
      if (db.categories.find(c => c.id === t.categoryId)) { selCat.value = f.categoryId = t.categoryId; }
    } }))));
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
  const nc = el("input", { placeholder: "Új kategória neve" });
  wrap.append(el("div", { class: "card" }, el("label", {}, "Új kategória"), nc,
    el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => { if (nc.value.trim()) onAdd(nc.value.trim()); } }, "Hozzáadás")));
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

  wrap.append(el("h3", { style: "margin:4px 0 8px" }, "Kiadás tételek"));
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

  // Pénzmozgás-sablonok (bejövő/kimenő gyorslista)
  let trList = db.templates.transfers.slice().sort((a, b) => a.name.localeCompare(b.name, "hu"));
  if (q) trList = trList.filter(t => (t.name + " " + (t.partner || "")).toLowerCase().includes(q));
  const trShown = trList.slice(0, 60);
  wrap.append(el("h3", { style: "margin:16px 0 8px" }, "Pénzmozgás"));
  if (!db.templates.transfers.length) wrap.append(el("div", { class: "card muted" }, "Még nincs elmentett pénzmozgás. Ahogy bejövőt/kimenőt veszel fel, ezek automatikusan ide kerülnek gyorslistának."));
  else if (!trList.length) wrap.append(el("div", { class: "card muted" }, "Nincs találat."));
  for (const t of trShown) {
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" }, el("span", { class: "sec-title", style: "font-size:1rem" }, t.name), el("span", { class: "muted" }, ft(t.lastAmount ?? 0))));
    card.append(el("div", { class: "muted", style: "margin:2px 0 8px" }, `${t.dir === "in" ? "Bejövő" : "Kimenő"} · ${t.partner || "—"}`));
    const row = el("div", { class: "row" });
    row.append(el("button", { class: "ghost", onclick: () => h.onEditTransferTemplate(t.id) }, "Szerkeszt"));
    row.append(el("button", { class: "ghost", style: "color:var(--neg)", onclick: () => h.onDeleteTransferTemplate(t) }, "Töröl"));
    card.append(row);
    wrap.append(card);
  }
  if (trList.length > trShown.length) wrap.append(el("p", { class: "muted" }, `${trShown.length} / ${trList.length} látszik — finomíts a keresésen a többihez.`));
  return wrap;
}

export function renderTransferTemplateForm(state, { template, onSave, onDelete, onCancel }) {
  const f = { name: template.name, partner: template.partner || "", lastAmount: template.lastAmount ?? "", dir: template.dir };
  const wrap = el("div", {});
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Megnevezés" });
  const inPartner = el("input", { value: f.partner, oninput: e => f.partner = e.target.value, placeholder: "Partner" });
  const inAmount = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.lastAmount, oninput: e => f.lastAmount = Number(e.target.value), placeholder: "Összeg (Ft)" });
  const selDir = el("select", { onchange: e => f.dir = e.target.value },
    el("option", { value: "in", ...(f.dir === "in" ? { selected: "" } : {}) }, "Bejövő"),
    el("option", { value: "out", ...(f.dir === "out" ? { selected: "" } : {}) }, "Kimenő"));
  wrap.append(el("label", {}, "Megnevezés"), inName);
  wrap.append(el("label", {}, "Partner"), inPartner);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (Ft)"), inAmount), el("div", {}, el("label", {}, "Irány"), selDir)));
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name) { toast("Megnevezés kötelező."); return; } onSave(template.id, { name: f.name.trim(), partner: f.partner.trim(), lastAmount: Math.round(Number(f.lastAmount) || 0), dir: f.dir }); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(template) }, "Törlés"));
  return wrap;
}

export function renderTemplateForm(state, { template, onSave, onDelete, onCancel }) {
  const { db } = state;
  const f = { name: template.name, store: template.store || "", lastPrice: template.lastPrice ?? "", categoryId: template.categoryId, payment: template.payment || "card" };
  const wrap = el("div", {});
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
  wrap.append(renderPageHead(state, h, "Pénzmozgás"));

  const q = (state.transferSearch || "").trim().toLowerCase();
  const psr = searchRow("pm-search", state.transferSearch || "", "Keresés (megnevezés, partner vagy dátum)", h.onTransferSearch);
  psr.style.marginBottom = "12px";
  wrap.append(psr);

  for (const [dir, title] of [["in", "Bejövő"], ["out", "Kimenő"], ["swap", "Átvezetés"]]) {
    const all = m.transfers.filter(t => t.dir === dir);
    const sum = all.reduce((s, t) => s + t.amount, 0);
    const list = q ? all.filter(t => (t.name + " " + (t.partner || "") + " " + dateSearchText(t.date)).toLowerCase().includes(q)) : all;
    if (q && !list.length) continue;
    const key = "tr:" + dir;
    const open = q ? true : !isCollapsed(state, key);
    const card = el("div", { class: "card" });
    const sumStyle = dir === "swap" ? "color:var(--muted)" : "color:" + (dir === "in" ? "var(--pos)" : "var(--neg)");
    const sign = dir === "in" ? "+" : dir === "out" ? "−" : "";
    const chevEl = chev(open);
    const inner = el("div", {});
    if (dir === "swap") inner.append(el("div", { class: "muted", style: "font-size:0.8125rem;margin:0 0 4px" }, "Az átvezetések nem számítanak bele az összesítésekbe."));
    for (const t of list) {
      const small = dir === "swap"
        ? `${t.date || "—"}${t.kind === "person" && t.partner ? ` · ${t.partner}` : ""}${t.kind === "person" && t.flow ? ` · ${SWAP_FLOW[t.flow] || ""}` : ""}`
        : `${t.date || "—"} · ${t.method === "cash" ? "kp" : "utalás"} · ${t.partner || "—"}`;
      inner.append(el("div", { class: "item", onclick: () => h.onEditTransfer(t.id) },
        el("div", {}, el("div", {}, t.name), el("small", {}, small)),
        el("div", { class: dir === "in" ? "pos" : dir === "out" ? "neg" : "muted" }, sign + ft(t.amount))));
    }
    if (!list.length) inner.append(el("div", { class: "item muted" }, "Nincs tétel"));
    inner.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => h.onAddTransfer(dir) }, `Új ${title.toLowerCase()}`));
    const { body, toggle } = collapsibleBody(open, inner, chevEl, (collapsed) => h.onSetCollapsed(key, collapsed));
    card.append(el("button", { class: "collapse-head", onclick: toggle },
      el("span", { class: "left" }, chevEl, el("span", { class: "sec-title" }, title)),
      el("span", { class: "sec-sum", style: sumStyle }, sign + ft(sum))));
    card.append(body);
    wrap.append(card);
  }
  return wrap;
}

// Átvezetés (kp ↔ kártya, vagy csere mással) — nem számít bele semmilyen összesítésbe.
const SWAP_KINDS = [
  ["withdraw", "Készpénzfelvétel (kártyáról kp)"],
  ["deposit", "Befizetés kártyára (kp-ról)"],
  ["person", "Csere valakivel"],
];
export const SWAP_LABEL = { withdraw: "Készpénzfelvétel", deposit: "Befizetés kártyára", person: "Csere" };
export const SWAP_FLOW = { card2cash: "kártya → kp", cash2card: "kp → kártya" };

function renderSwapForm(state, { transfer, onSave, onDelete, onCancel }) {
  const v = transfer || { dir: "swap", kind: "withdraw", name: "", amount: "", date: todayKey(), partner: "", note: "", flow: "card2cash" };
  const f = { ...v };
  if (!f.kind) f.kind = "withdraw";
  if (!f.flow) f.flow = "card2cash";
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, transfer ? "Átvezetés szerkesztése" : "Új átvezetés"));
  wrap.append(el("p", { class: "muted", style: "margin:0 0 8px;font-size:0.875rem" }, "Ugyanaz a pénz kerül máshova (nem kiadás, nem bevétel) — nem számít bele az összesítésekbe."));
  const selKind = el("select", { onchange: e => { f.kind = e.target.value; nameBox.style.display = f.kind === "person" ? "" : "none"; } },
    ...SWAP_KINDS.map(([val, lab]) => el("option", { value: val, ...(f.kind === val ? { selected: "" } : {}) }, lab)));
  const inPartner = el("input", { value: f.partner || "", oninput: e => f.partner = e.target.value, placeholder: "Név (kivel/kinek)" });
  const selFlow = el("select", { onchange: e => f.flow = e.target.value },
    el("option", { value: "card2cash", ...(f.flow === "card2cash" ? { selected: "" } : {}) }, "Kártya → kp (én utaltam, ő kp-t adott)"),
    el("option", { value: "cash2card", ...(f.flow === "cash2card" ? { selected: "" } : {}) }, "Kp → kártya (én adtam kp-t, ő utalt)"));
  const inAmt = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount, oninput: e => f.amount = Number(e.target.value), placeholder: "Összeg (Ft)" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
  wrap.append(el("label", {}, "Mi történt?"), selKind);
  const nameBox = el("div", { style: f.kind === "person" ? "" : "display:none" },
    el("label", {}, "Kivel/kinek"), inPartner,
    el("label", {}, "Merre ment a pénz?"), selFlow);
  wrap.append(nameBox);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (Ft)"), inAmt), el("div", {}, el("label", {}, "Dátum"), inDate)));
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => {
    if (!(f.amount > 0)) { toast("Összeg kötelező."); return; }
    if (f.kind !== "person") { f.partner = ""; f.flow = f.kind === "withdraw" ? "card2cash" : "cash2card"; }
    f.name = SWAP_LABEL[f.kind] || "Átvezetés";
    onSave(f);
  } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (transfer && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(transfer.id) }, "Törlés"));
  return wrap;
}

export function renderTransferForm(state, { transfer, dir, onSave, onDelete, onCancel }) {
  if ((transfer ? transfer.dir : dir) === "swap") return renderSwapForm(state, { transfer, onSave, onDelete, onCancel });
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
    const tpls = state.db.templates.transfers.filter(t => t.dir === f.dir)
      .slice().sort((a, b) => a.name.localeCompare(b.name, "hu"));
    if (tpls.length) {
      wrap.append(...quickListBox(tpls.map(t => ({ name: t.name, onPick: () => {
        inName.value = f.name = t.name; inPartner.value = f.partner = t.partner || ""; inAmt.value = f.amount = t.lastAmount ?? "";
      } }))));
    }
  }
  wrap.append(el("label", {}, "Megnevezés"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (Ft)"), inAmt), el("div", {}, el("label", {}, "Dátum"), inDate)));
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Mód"), selMethod), el("div", {}, el("label", {}, f.dir === "in" ? "Kitől" : "Kinek"), inPartner)));
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  if (f.dir === "out") {
    const cbMand = el("input", { type: "checkbox", ...(f.mandatory ? { checked: "" } : {}), onchange: e => f.mandatory = e.target.checked });
    wrap.append(el("label", { style: "display:flex;align-items:center;gap:10px;margin-top:10px;color:var(--fg)" }, cbMand, el("span", {}, "Kötelező kiadás (rezsi, törlesztő, albérlet…)")));
  }
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name || !(f.amount >= 0)) { toast("Megnevezés és összeg kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (transfer && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(transfer.id) }, "Törlés"));
  return wrap;
}

// --- Áttekintő ---

// Áttekintő-kártya összecsukható fejléccel; a tartalom a visszaadott „body"-ba kerül.
function ovCard(state, h, key, title) {
  const card = el("div", { class: "card" });
  const open = !isCollapsed(state, "ov:" + key);
  const chevEl = chev(open);
  const inner = el("div", {});
  const { body, toggle } = collapsibleBody(open, inner, chevEl, (collapsed) => h.onSetCollapsed("ov:" + key, collapsed));
  card.append(el("button", { class: "collapse-head", onclick: toggle },
    el("span", { class: "left" }, chevEl, el("span", { class: "sec-title", style: "font-size:1.0625rem" }, title))));
  card.append(body);
  return [card, inner];
}

export function renderOverview(state, h) {
  const wrap = el("div", {});
  const o = monthOverview(state.db, state.month);
  wrap.append(renderPageHead(state, h, "Áttekintő"));
  const kpi = el("div", { class: "card" });
  kpi.append(el("div", { class: "cat-head" }, el("span", {}, "Bevétel"), el("span", { class: "pos" }, ft(o.income))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kiadás"), el("span", { class: "neg" }, ft(o.totalExpense))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px;font-weight:700" }, el("span", {}, "Egyenleg"), el("span", { class: o.balance >= 0 ? "pos" : "neg" }, ft(o.balance))));
  wrap.append(kpi);

  const cmp = monthComparison(state.db, state.month, todayKey());
  const [cmpCard, cmpBody] = ovCard(state, h, "cmp", "Összehasonlítás");
  cmpBody.append(el("div", { class: "cat-head" }, el("span", {}, "Előző hónap kiadása"), el("span", { class: "muted" }, ft(cmp.prev))));
  const dColor = cmp.delta > 0 ? "var(--neg)" : (cmp.delta < 0 ? "var(--pos)" : "var(--muted)");
  const dTxt = (cmp.delta > 0 ? "+" : "") + ft(cmp.delta) + (cmp.deltaPct !== null ? ` (${cmp.deltaPct > 0 ? "+" : ""}${cmp.deltaPct}%)` : "");
  cmpBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Változás"), el("span", { style: `color:${dColor};font-weight:600` }, dTxt)));
  if (cmp.projItems != null) {
    cmpBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Várható bolti kiadás"), el("span", { class: "muted" }, "~" + ft(cmp.projItems))));
    cmpBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Várható havi összes"), el("span", { class: "muted" }, "~" + ft(cmp.projTotal))));
    cmpBody.append(el("p", { class: "muted", style: "margin:4px 0 0;font-size:0.8125rem" }, "A „bolti” a napi vásárlásod előrevetítve. Az „összes” ehhez hozzáadja a kimenő pénzmozgásokat (azokat nem szorozza fel)."));
  }
  wrap.append(cmpCard);

  const [cats, catsBody] = ovCard(state, h, "cats", "Kiadások kategóriánként");
  for (const b of o.byCategory) {
    catsBody.append(el("div", { class: "cat-head", style: "margin-top:8px" }, el("span", {}, b.name), el("span", { class: "muted" }, `${ft(b.sum)} · ${Math.round(b.share * 100)}%`)));
    catsBody.append(el("div", { class: "bar" }, el("span", { style: `width:${Math.round(b.share * 100)}%` })));
  }
  wrap.append(cats);

  // Kötelező kiadások: csak összegek (a tételes lista a Kiadások fülön pipálható)
  const due = dueSummaryForMonth(state.db, state.month, todayKey());
  const [rem, remBody] = ovCard(state, h, "due", "Kötelező kiadások");
  if (!due.length) {
    remBody.append(el("div", { class: "muted" }, "Nincs esedékes ebben a hónapban."));
  } else {
    const withAmount = due.filter(d => d.reminder.amount != null && d.reminder.amount !== "");
    const total = withAmount.reduce((s, d) => s + Number(d.reminder.amount), 0);
    const paidTotal = withAmount.filter(d => d.paid).reduce((s, d) => s + Number(d.reminder.amount), 0);
    const cashDue = withAmount.filter(d => d.reminder.payment === "cash").reduce((s, d) => s + Number(d.reminder.amount), 0);
    remBody.append(el("div", { class: "cat-head" }, el("span", {}, "Összesen"), el("span", { class: "muted" }, ft(total))));
    remBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Ebből kifizetve"), el("span", { class: "muted" }, ft(paidTotal))));
    remBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Hátralévő"), el("span", { style: "color:var(--neg);font-weight:600" }, ft(total - paidTotal))));
    remBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Ebből készpénz"), el("span", { class: "muted" }, ft(cashDue))));
    remBody.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Ebből kártya"), el("span", { class: "muted" }, ft(total - cashDue))));
  }
  wrap.append(rem);

  // Havi statisztika (lent), legalul az éves — azonos felépítéssel
  const stats = monthStats(state.db, state.month);
  const year = state.month.slice(0, 4);
  const yt = yearTotals(state.db, year);
  const ys = yearStats(state.db, year);
  const statRow = (card, label, value, first) =>
    card.append(el("div", { class: "cat-head", style: first ? "" : "margin-top:6px" }, el("span", {}, label), el("span", { class: "muted" }, value)));

  const [mCard, mBody] = ovCard(state, h, "mstat", "Havi statisztika");
  if (stats.topStore) statRow(mBody, "Legtöbbet itt költöttél", `${stats.topStore.name} · ${ft(stats.topStore.sum)}`, true);
  if (stats.biggestItem) statRow(mBody, "Legnagyobb tétel", `${stats.biggestItem.name} · ${ft(stats.biggestItem.price)}`);
  statRow(mBody, "Összes kiadás", ft(o.totalExpense), !stats.topStore && !stats.biggestItem);
  statRow(mBody, "Kötelező kiadás (pénzmozgás)", ft(o.mandatoryOut));
  statRow(mBody, "Egyéb kiadás (pénzmozgás)", ft(o.otherOut));
  statRow(mBody, "Bolti kiadás", ft(o.expenseItems));
  statRow(mBody, "Bolti készpénz", ft(o.cash));
  statRow(mBody, "Bolti kártya", ft(o.card));
  statRow(mBody, "Bejövő pénzmozgás", ft(o.income));
  wrap.append(mCard);

  const [yCard, yBody] = ovCard(state, h, "ystat", `Éves statisztika (${year})`);
  if (ys.topStore) statRow(yBody, "Legtöbbet itt költöttél", `${ys.topStore.name} · ${ft(ys.topStore.sum)}`, true);
  if (ys.biggestItem) statRow(yBody, "Legnagyobb tétel", `${ys.biggestItem.name} · ${ft(ys.biggestItem.price)}`);
  statRow(yBody, "Összes kiadás", ft(yt.total), !ys.topStore && !ys.biggestItem);
  statRow(yBody, "Kötelező kiadás (pénzmozgás)", ft(yt.mandatory));
  statRow(yBody, "Egyéb kiadás (pénzmozgás)", ft(yt.other));
  statRow(yBody, "Bolti kiadás", ft(yt.shop));
  statRow(yBody, "Bolti készpénz", ft(yt.cash));
  statRow(yBody, "Bolti kártya", ft(yt.card));
  statRow(yBody, "Bejövő pénzmozgás", ft(yt.income));
  yBody.append(el("p", { class: "muted", style: "margin:8px 0 0;font-size:0.8125rem" }, "Kötelező = a Pénzmozgásnál kötelezőként jelölt kimenők (a „Kifizetve” gombbal rögzítettek automatikusan azok). A bolti nincs benne."));
  wrap.append(yCard);
  return wrap;
}

// --- Import ---

export function renderImportView(state, { onDecode, onConfirm, onBack, onCopyPrompt, onEditRow, onPickCat, initialCode }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Blokk bevitel"), el("button", { class: "ghost", onclick: onBack }, "Vissza")));

  const help = el("div", { class: "card" });
  help.append(el("label", {}, "1. lépés — beolvasás Claude-dal"));
  help.append(el("p", { class: "muted", style: "margin:0 0 8px" }, "Koppints, másold ki a beolvasó szöveget, majd a Claude appban illeszd be a blokk fotójával. Válaszul egy JSON-t kapsz — azt hozd vissza ide."));
  if (onCopyPrompt) help.append(el("button", { class: "primary", style: "width:100%", onclick: onCopyPrompt }, "Beolvasó szöveg másolása"));
  wrap.append(help);

  const ta = el("textarea", { rows: "4", placeholder: "2. lépés — illeszd be ide a Claude válaszát (JSON)" }, initialCode || "");
  wrap.append(el("div", { class: "card" }, ta, el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => onDecode(ta.value) }, "Beolvasás")));

  if (state.importPreview) {
    const p = state.importPreview;
    const box = el("div", { class: "card" });
    const dates = [...new Set(p.rows.map(r => r.date).filter(Boolean))];
    const headerLabel = dates.length === 1 ? importDateLabel(dates[0]) : monthLabel(p.month);
    box.append(el("h3", {}, `${p.rows.length} tétel — ${headerLabel}`));
    box.append(el("p", { class: "muted", style: "margin:0 0 8px" }, "Tipp: tartsd nyomva egy tétel nevét a név/üzlet javításához."));
    p.rows.forEach((r, idx) => {
      const nameEl = el("div", { class: "editable-name" }, `${r.name} — ${ft(r.price)}`);
      if (onEditRow) attachLongPress(nameEl, () => onEditRow(idx));
      const info = el("div", { class: "imp-info" }, nameEl, el("small", {}, `${r.qty} db · ${r.store || "—"} · ${r.payment === "cash" ? "kp" : "kártya"}`));
      const catNm = (db.categories.find(c => c.id === r.categoryId) || {}).name || "—";
      const lbl = el("span", { class: "cat-pick-lbl" }, catNm);
      const pick = el("button", { class: "cat-pick", onclick: () => onPickCat && onPickCat(idx) }, lbl, el("span", { class: "cat-pick-caret" }, "▾"));
      requestAnimationFrame(() => fitLabel(lbl, catNm));
      box.append(el("div", { class: "item imp-row" }, info, pick));
    });
    const total = p.rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
    box.append(el("div", { class: "cat-head", style: "margin-top:10px;font-weight:800;font-size:1.05rem" }, el("span", {}, "Összesen"), el("span", {}, ft(total))));
    box.append(el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: onConfirm }, "Hozzáadás a hónaphoz"));
    wrap.append(box);
  }
  return wrap;
}

// --- Emlékeztetők ---

export function renderReminderForm(state, { reminder, onSave, onDelete, onCancel }) {
  const v = reminder || { name: "", amount: "", note: "", active: true, freq: "monthly", interval: 1, startDate: todayKey(), until: "", notify: true, notifyTime: "09:00", payment: "card" };
  const f = { ...v };
  if (f.notify === undefined) f.notify = true;
  if (!f.payment) f.payment = "card";
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
  const selPay = el("select", { onchange: e => f.payment = e.target.value },
    el("option", { value: "card", ...(f.payment === "card" ? { selected: "" } : {}) }, "Kártya"),
    el("option", { value: "cash", ...(f.payment === "cash" ? { selected: "" } : {}) }, "Készpénz"));
  const cbNotify = el("input", { type: "checkbox", ...(f.notify ? { checked: "" } : {}), onchange: e => { f.notify = e.target.checked; timeBox.style.display = f.notify ? "" : "none"; } });

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (opcionális)"), inAmount), el("div", {}, el("label", {}, "Állapot"), inActive)));
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Fizetés"), selPay), el("div", {}, el("label", {}, "Megjegyzés"), inNote)));
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
      `${FREQ_LABEL[r.freq]}${r.interval > 1 ? ` /${r.interval}` : ""} · ${r.payment === "cash" ? "kp" : "kártya"}` + (dates.length ? ` · e havi esedékesség: ${dates.join(", ")}` : " · nincs e havi esedékesség")));
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
  return `${items} tétel · ${transfers} pénzmozgás · ${(db.reminders || []).length} emlékeztető`;
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
    b("Blokk bevitel", h.onOpenImportView, "primary"),
    b("Kötelező kiadások / emlékeztetők", h.onOpenReminders),
    b("Elmentett tételek", h.onOpenTemplates),
    b("Kategóriák kezelése", h.onManageCategories),
    b("Hogyan használd (súgó)", h.onOpenHelp));
  wrap.append(linksCard);

  // 2) Értesítések (a Kezelés alatt) — ki/be csúszka
  const notifCard = el("div", { class: "card" });
  const knob = el("span", { class: "switch" + (db.settings.notifications ? " on" : "") }, el("span", { class: "knob" }));
  notifCard.append(el("button", { class: "switch-row", onclick: h.onToggleNotifications },
    el("span", {}, "Értesítések (esedékes kötelező kiadások)"), knob));
  notifCard.append(el("p", { class: "muted", style: "margin:8px 0 0" }, "Helyi értesítés az app nyitásakor. Zárt appnál is szóló riasztáshoz használd az emlékeztetőnél a „Naptárba” gombot."));
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
    ...[["small", "Kicsi"], ["normal", "Normál"]].map(([v, l]) => el("option", { value: v, ...(db.settings.fontScale === v ? { selected: "" } : {}) }, l))));
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
  verCard.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: h.onCheckUpdate }, "Frissítés keresése"));
  wrap.append(verCard);
  return wrap;
}
