import { monthOverview, categoryTotal, remindersDueInMonth, occurrencesInMonth } from "./model.js";

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
export function todayKey() { return new Date().toISOString().slice(0, 10); }

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

export function findCategoryIdByName(db, name) {
  const c = db.categories.find(x => x.name.toLowerCase() === String(name || "").toLowerCase());
  return c ? c.id : null;
}

const FREQ_LABEL = { daily: "napi", weekly: "heti", monthly: "havi" };

// --- Esedékes-banner ---

export function renderDueBanner(state, h) {
  const due = remindersDueInMonth(state.db, state.month).filter(x => !x.paid);
  if (!due.length) return null;
  const card = el("div", { class: "card", style: "border-color:var(--accent)" });
  card.append(el("div", { class: "cat-head" }, el("strong", {}, "Esedékes kötelező kiadás"), el("span", { class: "muted" }, `${due.length} db`)));
  card.append(el("div", { class: "muted", style: "margin-top:4px" }, due.map(x => x.reminder.name).join(", ")));
  card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => { state.view = "reminders"; h.rerender(); } }, "Megnézem"));
  return card;
}

// --- Hónap nézet ---

export function renderMonthView(state, h) {
  const { db, month } = state;
  const wrap = el("div");
  const banner = renderDueBanner(state, h); if (banner) wrap.append(banner);

  wrap.append(el("div", { class: "topbar" },
    el("div", { class: "month-nav" },
      el("button", { class: "ghost", "aria-label": "Előző hónap", onclick: h.onPrevMonth }, "‹"),
      el("span", {}, monthLabel(month)),
      el("button", { class: "ghost", "aria-label": "Következő hónap", onclick: h.onNextMonth }, "›"),
    ),
    el("button", { class: "primary", onclick: h.onAddItem }, "Új tétel"),
  ));

  const m = db.months[month] || { items: [], transfers: [] };
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    const items = m.items.filter(i => i.categoryId === c.id);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" }, el("span", {}, c.name), el("span", { class: "cat-sum" }, ft(categoryTotal(db, month, c.id)))));
    for (const it of items) {
      card.append(el("div", { class: "item", onclick: () => h.onEditItem(it.id) },
        el("div", {}, el("div", {}, it.name), el("small", {}, `${it.qty} db · ${it.store || "—"} · ${it.payment === "cash" ? "kp" : "kártya"}`)),
        el("div", {}, ft(it.price))));
    }
    if (!items.length) card.append(el("div", { class: "item muted" }, "Nincs tétel"));
    wrap.append(card);
  }
  const o = monthOverview(db, month);
  wrap.append(el("div", { class: "total" }, `Havi kiadás: ${ft(o.totalExpense)}`));
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
  const inQty = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.qty, oninput: e => f.qty = Number(e.target.value) });
  const inPrice = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.price, oninput: e => f.price = Number(e.target.value), placeholder: "Ár (Ft)" });
  const inStore = el("input", { value: f.store, oninput: e => f.store = e.target.value, placeholder: "Üzlet" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
  const selPay = el("select", { onchange: e => f.payment = e.target.value },
    el("option", { value: "card", ...(f.payment === "card" ? { selected: "" } : {}) }, "Kártya"),
    el("option", { value: "cash", ...(f.payment === "cash" ? { selected: "" } : {}) }, "Készpénz"));
  const selCat = el("select", { onchange: e => f.categoryId = e.target.value },
    ...db.categories.map(c => el("option", { value: c.id, ...(c.id === f.categoryId ? { selected: "" } : {}) }, c.name)));

  if (!item && db.templates.items.length) {
    const quick = el("div", { class: "quick" });
    wrap.append(el("label", {}, "Gyorslista"));
    for (const t of db.templates.items) {
      quick.append(el("button", { class: "ghost", onclick: () => {
        inName.value = f.name = t.name;
        inStore.value = f.store = t.store || "";
        inQty.value = f.qty = t.lastQty ?? 1;
        inPrice.value = f.price = t.lastPrice ?? "";
        selPay.value = f.payment = t.payment || "card";
        if (db.categories.find(c => c.id === t.categoryId)) { selCat.value = f.categoryId = t.categoryId; }
      } }, `+ ${t.name}`));
    }
    wrap.append(quick);
  }

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Darab"), inQty), el("div", {}, el("label", {}, "Ár (Ft)"), inPrice)));
  wrap.append(el("label", {}, "Üzlet"), inStore);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Dátum"), inDate), el("div", {}, el("label", {}, "Fizetés"), selPay)));
  wrap.append(el("label", {}, "Kategória"), selCat);

  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name || !(f.price >= 0)) { alert("Név és ár kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (item && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(item.id) }, "Törlés"));
  return wrap;
}

// --- Kategória-kezelő ---

export function renderCategoryManager(state, { onAdd, onRename, onDelete, onBack }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Kategóriák"), el("button", { class: "ghost", onclick: onBack }, "Kész")));
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    const card = el("div", { class: "card" });
    const input = el("input", { value: c.name });
    card.append(el("label", {}, "Név"), input);
    const actions = el("div", { class: "row", style: "margin-top:8px" });
    actions.append(el("button", { class: "primary", onclick: () => onRename(c.id, input.value.trim()) }, "Átnevez"));
    actions.append(el("button", { class: "ghost", style: "color:var(--neg)", onclick: () => onDelete(c) }, "Törlés"));
    card.append(actions);
    wrap.append(card);
  }
  const nc = el("input", { placeholder: "Új kategória neve" });
  wrap.append(el("div", { class: "card" }, el("label", {}, "Új kategória"), nc,
    el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => { if (nc.value.trim()) onAdd(nc.value.trim()); } }, "Hozzáadás")));
  return wrap;
}

// --- Utalások nézet + űrlap ---

export function renderTransfersView(state, h) {
  const { db, month } = state;
  const m = db.months[month] || { items: [], transfers: [] };
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Utalások"), el("span", { class: "muted" }, monthLabel(month))));
  for (const [dir, title] of [["in", "Bejövő"], ["out", "Kimenő"]]) {
    const list = m.transfers.filter(t => t.dir === dir);
    const sum = list.reduce((s, t) => s + t.amount, 0);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" }, el("span", {}, title), el("span", { class: "cat-sum" }, ft(sum))));
    for (const t of list) {
      card.append(el("div", { class: "item", onclick: () => h.onEditTransfer(t.id) },
        el("div", {}, el("div", {}, t.name), el("small", {}, `${t.date || "—"} · ${t.partner || "—"}`)),
        el("div", { class: dir === "in" ? "pos" : "neg" }, (dir === "in" ? "+" : "−") + ft(t.amount))));
    }
    card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => h.onAddTransfer(dir) }, `Új ${title.toLowerCase()}`));
    wrap.append(card);
  }
  return wrap;
}

export function renderTransferForm(state, { transfer, dir, onSave, onDelete, onCancel }) {
  const v = transfer || { dir, name: "", amount: "", date: todayKey(), partner: "", note: "" };
  const f = { ...v };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, transfer ? "Utalás szerkesztése" : (f.dir === "in" ? "Új bejövő" : "Új kimenő")));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Megnevezés" });
  const inAmt = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount, oninput: e => f.amount = Number(e.target.value), placeholder: "Összeg (Ft)" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
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
  wrap.append(el("label", {}, f.dir === "in" ? "Kitől" : "Kinek"), inPartner);
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name || !(f.amount >= 0)) { alert("Megnevezés és összeg kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (transfer && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(transfer.id) }, "Törlés"));
  return wrap;
}

// --- Áttekintő ---

export function renderOverview(state, h) {
  const wrap = el("div", {});
  const banner = renderDueBanner(state, h); if (banner) wrap.append(banner);
  const o = monthOverview(state.db, state.month);
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Áttekintő"), el("span", { class: "muted" }, monthLabel(state.month))));
  const kpi = el("div", { class: "card" });
  kpi.append(el("div", { class: "cat-head" }, el("span", {}, "Bevétel"), el("span", { class: "pos" }, ft(o.income))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kiadás"), el("span", { class: "neg" }, ft(o.totalExpense))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px;font-weight:700" }, el("span", {}, "Egyenleg"), el("span", { class: o.balance >= 0 ? "pos" : "neg" }, ft(o.balance))));
  wrap.append(kpi);

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
  pay.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kimenő utalás"), el("span", { class: "muted" }, ft(o.expenseOut))));
  wrap.append(pay);
  return wrap;
}

// --- Import ---

export function renderImportView(state, { onDecode, onConfirm, onBack, initialCode }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Blokk import"), el("button", { class: "ghost", onclick: onBack }, "Vissza")));
  const ta = el("textarea", { rows: "4", placeholder: "Illeszd be ide a Claude-tól kapott import-kódot" }, initialCode || "");
  wrap.append(el("div", { class: "card" }, ta, el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => onDecode(ta.value) }, "Beolvasás")));

  if (state.importPreview) {
    const p = state.importPreview;
    const box = el("div", { class: "card" });
    box.append(el("h3", {}, `${p.rows.length} tétel — ${monthLabel(p.month)}`));
    p.rows.forEach((r) => {
      const sel = el("select", { onchange: e => r.categoryId = e.target.value }, ...db.categories.map(c => el("option", { value: c.id, ...(c.id === r.categoryId ? { selected: "" } : {}) }, c.name)));
      box.append(el("div", { class: "item" },
        el("div", {}, el("div", {}, `${r.name} — ${ft(r.price)}`), el("small", {}, `${r.qty} db · ${r.store || "—"} · ${r.payment === "cash" ? "kp" : "kártya"}`)),
        sel));
    });
    box.append(el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: onConfirm }, "Hozzáadás a hónaphoz"));
    wrap.append(box);
  }
  return wrap;
}

// --- Emlékeztetők ---

export function renderReminderForm(state, { reminder, onSave, onDelete, onCancel }) {
  const v = reminder || { name: "", amount: "", note: "", active: true, freq: "monthly", interval: 1, startDate: todayKey(), until: "", notifyTime: "09:00" };
  const f = { ...v };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, reminder ? "Emlékeztető szerkesztése" : "Új emlékeztető"));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Név (pl. Törlesztő)" });
  const inAmount = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount ?? "", oninput: e => f.amount = e.target.value === "" ? null : Number(e.target.value), placeholder: "Összeg (opcionális)" });
  const inNote = el("input", { value: f.note, oninput: e => f.note = e.target.value, placeholder: "Megjegyzés" });
  const selFreq = el("select", { onchange: e => f.freq = e.target.value },
    ...[["monthly", "havi"], ["weekly", "heti"], ["daily", "napi"]].map(([val, lab]) => el("option", { value: val, ...(f.freq === val ? { selected: "" } : {}) }, lab)));
  const inInterval = el("input", { type: "number", inputmode: "numeric", min: "1", value: f.interval, oninput: e => f.interval = Math.max(1, Number(e.target.value) || 1) });
  const inStart = el("input", { type: "date", value: f.startDate, oninput: e => f.startDate = e.target.value });
  const inUntil = el("input", { type: "date", value: f.until || "", oninput: e => f.until = e.target.value || null });
  const inTime = el("input", { type: "time", value: f.notifyTime, oninput: e => f.notifyTime = e.target.value });
  const inActive = el("select", { onchange: e => f.active = e.target.value === "yes" },
    el("option", { value: "yes", ...(f.active ? { selected: "" } : {}) }, "Aktív"),
    el("option", { value: "no", ...(!f.active ? { selected: "" } : {}) }, "Kikapcsolva"));

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (opcionális)"), inAmount), el("div", {}, el("label", {}, "Állapot"), inActive)));
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Ismétlődés"), selFreq), el("div", {}, el("label", {}, "Gyakoriság (pl. 2 = kéthavonta)"), inInterval)));
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Kezdő dátum"), inStart), el("div", {}, el("label", {}, "Lejárat (opcionális)"), inUntil)));
  wrap.append(el("label", {}, "Értesítés ideje"), inTime);

  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name) { alert("Név kötelező."); return; } onSave(f); } }, "Mentés"));
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

// --- Beállítások ---

export function renderSettings(state, h) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("h2", {}, "Beállítások"));

  const themeCard = el("div", { class: "card" });
  themeCard.append(el("label", {}, "Téma"));
  themeCard.append(el("select", { onchange: e => h.onSetTheme(e.target.value) },
    ...[["system", "Rendszer szerint"], ["dark", "Sötét"], ["light", "Világos"]].map(([vv, l]) => el("option", { value: vv, ...(db.settings.theme === vv ? { selected: "" } : {}) }, l))));
  wrap.append(themeCard);

  const notifCard = el("div", { class: "card" });
  notifCard.append(el("div", { class: "cat-head" }, el("span", {}, "Értesítések (esedékes kötelező kiadások)"), el("span", { class: "muted" }, db.settings.notifications ? "Be" : "Ki")));
  notifCard.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: h.onToggleNotifications }, db.settings.notifications ? "Kikapcsolás" : "Bekapcsolás"));
  notifCard.append(el("p", { class: "muted" }, "Helyi értesítés az app nyitásakor. Zárt appnál is szóló riasztáshoz használd az emlékeztetőnél a „Naptárba” gombot."));
  wrap.append(notifCard);

  const b = (label, fn, cls = "") => el("button", { class: cls, style: "width:100%;margin-bottom:8px", onclick: fn }, label);
  const dataCard = el("div", { class: "card" });
  dataCard.append(el("label", {}, "Adatok"),
    b("Export — ez a hónap (CSV)", h.onExportMonth, "primary"),
    b("Export — minden hónap (CSV)", h.onExportAll),
    b("Backup mentése (JSON)", h.onBackup),
    b("Backup visszatöltése", h.onRestore));
  wrap.append(dataCard);

  const linksCard = el("div", { class: "card" });
  linksCard.append(el("label", {}, "Kezelés"),
    b("Kötelező kiadások / emlékeztetők", h.onOpenReminders, "primary"),
    b("Kategóriák kezelése", h.onManageCategories),
    b("Blokk import", h.onOpenImportView));
  wrap.append(linksCard);

  wrap.append(el("p", { class: "muted" }, "Az adatok a telefonon tárolódnak. Rendszeres backuppal véded őket telócsere ellen."));
  return wrap;
}
