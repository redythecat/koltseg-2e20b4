export const DEFAULT_CATEGORIES = [
  "Élelmiszer",
  "Alkohol/üdítő",
  "Tisztítószer",
  "Macska",
  "Luxus",
];

export function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createDatabase() {
  return {
    version: 1,
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: genId("cat"), name, order: i })),
    reminders: [],
    settings: { theme: "system", notifications: false, accent: "blue", collapsed: {}, fontScale: "normal" },
    months: {},
    templates: { items: [], transfers: [] },
  };
}

export function ensureMonth(db, monthKey) {
  if (!db.months[monthKey]) db.months[monthKey] = { items: [], transfers: [], paidReminders: [] };
  else if (!db.months[monthKey].paidReminders) db.months[monthKey].paidReminders = [];
  return db;
}

// --- Tétel-CRUD ---

function upsertItemTemplate(db, item) {
  // A sablonba az EGYSÉGÁR kerül (összeg ÷ darabszám), egész forintra felfelé kerekítve.
  // A tényleges kiadás (item.price = a sor összege) marad az igazság; sosem ebből számoljuk vissza.
  const unit = Math.ceil(item.price / Math.max(1, item.qty || 1));
  let t = db.templates.items.find(x => x.name === item.name && x.categoryId === item.categoryId);
  if (!t) {
    t = { id: genId("tpl"), name: item.name, store: item.store, categoryId: item.categoryId, lastPrice: unit, lastQty: 1, payment: item.payment };
    db.templates.items.push(t);
  } else {
    t.store = item.store;
    t.lastPrice = unit;
    t.lastQty = 1;
    t.payment = item.payment;
  }
}

export function deleteItemTemplate(db, id) {
  db.templates.items = db.templates.items.filter(t => t.id !== id);
  return db;
}

export function updateItemTemplate(db, id, patch) {
  const t = db.templates.items.find(x => x.id === id);
  if (t) Object.assign(t, patch);
  return db;
}

export function addItem(db, monthKey, item) {
  ensureMonth(db, monthKey);
  const created = { id: item.id || genId("item"), ...item };
  db.months[monthKey].items.push(created);
  upsertItemTemplate(db, created);
  return created;
}

export function updateItem(db, monthKey, itemId, patch) {
  const it = db.months[monthKey].items.find(x => x.id === itemId);
  if (it) Object.assign(it, patch);
  return db;
}

export function moveItem(db, monthKey, itemId, newCategoryId) {
  return updateItem(db, monthKey, itemId, { categoryId: newCategoryId });
}

export function deleteItem(db, monthKey, itemId) {
  const m = db.months[monthKey];
  m.items = m.items.filter(x => x.id !== itemId);
  return db;
}

// --- Kategória-CRUD ---

export function addCategory(db, name) {
  const order = db.categories.length ? Math.max(...db.categories.map(c => c.order)) + 1 : 0;
  const c = { id: genId("cat"), name, order };
  db.categories.push(c);
  return c;
}

export function renameCategory(db, categoryId, name) {
  const c = db.categories.find(x => x.id === categoryId);
  if (c) c.name = name;
  return db;
}

export function setCategoryBudget(db, categoryId, budget) {
  const c = db.categories.find(x => x.id === categoryId);
  if (c) c.budget = (budget === "" || budget == null || !(budget > 0)) ? null : Math.round(budget);
  return db;
}

// Kategóriák sorrendje egy id-lista alapján.
export function reorderCategories(db, idOrder) {
  idOrder.forEach((id, i) => { const c = db.categories.find(x => x.id === id); if (c) c.order = i; });
  db.categories.sort((a, b) => a.order - b.order);
  return db;
}

export function deleteCategory(db, categoryId, reassignToId) {
  for (const key of Object.keys(db.months)) {
    const m = db.months[key];
    if (reassignToId) {
      for (const it of m.items) if (it.categoryId === categoryId) it.categoryId = reassignToId;
    } else {
      m.items = m.items.filter(it => it.categoryId !== categoryId);
    }
  }
  db.templates.items = db.templates.items.filter(t => t.categoryId !== categoryId);
  db.categories = db.categories.filter(c => c.id !== categoryId);
  return db;
}

// --- Utalás-CRUD ---

function upsertTransferTemplate(db, t) {
  let tpl = db.templates.transfers.find(x => x.dir === t.dir && x.name === t.name);
  if (!tpl) db.templates.transfers.push({ dir: t.dir, name: t.name, partner: t.partner, lastAmount: t.amount });
  else { tpl.partner = t.partner; tpl.lastAmount = t.amount; }
}

export function addTransfer(db, monthKey, t) {
  ensureMonth(db, monthKey);
  const created = { id: t.id || genId("tr"), ...t };
  db.months[monthKey].transfers.push(created);
  upsertTransferTemplate(db, created);
  return created;
}

export function updateTransfer(db, monthKey, transferId, patch) {
  const t = db.months[monthKey].transfers.find(x => x.id === transferId);
  if (t) Object.assign(t, patch);
  return db;
}

export function deleteTransfer(db, monthKey, transferId) {
  const m = db.months[monthKey];
  m.transfers = m.transfers.filter(x => x.id !== transferId);
  return db;
}

// --- Összegzés / áttekintő ---

export function categoryTotal(db, monthKey, categoryId) {
  const m = db.months[monthKey];
  if (!m) return 0;
  return Math.round(m.items.filter(i => i.categoryId === categoryId).reduce((s, i) => s + i.price, 0));
}

export function monthOverview(db, monthKey) {
  const m = db.months[monthKey] || { items: [], transfers: [] };
  const income = Math.round(m.transfers.filter(t => t.dir === "in").reduce((s, t) => s + t.amount, 0));
  const expenseOut = Math.round(m.transfers.filter(t => t.dir === "out").reduce((s, t) => s + t.amount, 0));
  const expenseItems = Math.round(m.items.reduce((s, i) => s + i.price, 0));
  const cash = Math.round(m.items.filter(i => i.payment === "cash").reduce((s, i) => s + i.price, 0));
  const card = Math.round(m.items.filter(i => i.payment === "card").reduce((s, i) => s + i.price, 0));
  const byCategory = db.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(c => {
      const sum = categoryTotal(db, monthKey, c.id);
      return { categoryId: c.id, name: c.name, sum, share: expenseItems ? sum / expenseItems : 0 };
    });
  const totalExpense = expenseItems + expenseOut;
  return { income, expenseItems, expenseOut, totalExpense, balance: income - totalExpense, byCategory, cash, card };
}

// Hasznos statisztikák egy hónapra.
export function monthStats(db, monthKey) {
  const m = db.months[monthKey];
  const items = m ? m.items : [];
  let topStore = null, biggestItem = null;
  const byStore = {};
  for (const it of items) {
    const s = (it.store || "").trim();
    if (s) byStore[s] = (byStore[s] || 0) + it.price;
    if (!biggestItem || it.price > biggestItem.price) biggestItem = { name: it.name, price: Math.round(it.price), store: s };
  }
  for (const [name, sum] of Object.entries(byStore)) {
    if (!topStore || sum > topStore.sum) topStore = { name, sum: Math.round(sum) };
  }
  return { topStore, biggestItem };
}

// Egy adott év összes bolti kiadása (minden hónap tétele).
export function yearTotal(db, year) {
  let sum = 0;
  for (const key of Object.keys(db.months)) {
    if (key.startsWith(year + "-")) sum += db.months[key].items.reduce((s, i) => s + i.price, 0);
  }
  return Math.round(sum);
}

// --- Emlékeztetők (kötelező kiadások) ---

function parseDay(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function ymd(d) { return d.toISOString().slice(0, 10); }
function monthBounds(key) { const [y, m] = key.split("-").map(Number); return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) }; }

export function occurrencesInMonth(rem, monthKey) {
  if (!rem.active) return [];
  const { start: mStart, end: mEnd } = monthBounds(monthKey);
  const start = parseDay(rem.startDate);
  const until = rem.until ? parseDay(rem.until) : null;
  const interval = Math.max(1, rem.interval || 1);
  if (start > mEnd) return [];
  if (until && until < mStart) return [];
  const out = [];
  if (rem.freq === "none") {
    if (start >= mStart && start <= mEnd) out.push(ymd(start));
    return out;
  }
  if (rem.freq === "monthly") {
    const diff = (mStart.getUTCFullYear() - start.getUTCFullYear()) * 12 + (mStart.getUTCMonth() - start.getUTCMonth());
    if (diff >= 0 && diff % interval === 0) {
      const day = Math.min(start.getUTCDate(), mEnd.getUTCDate());
      const occ = new Date(Date.UTC(mStart.getUTCFullYear(), mStart.getUTCMonth(), day));
      if (occ >= start && (!until || occ <= until)) out.push(ymd(occ));
    }
    return out;
  }
  const stepDays = rem.freq === "weekly" ? 7 * interval : interval;
  let cur = new Date(start);
  let guard = 0;
  while (cur < mStart && guard++ < 100000) cur = new Date(cur.getTime() + stepDays * 86400000);
  while (cur <= mEnd && (!until || cur <= until) && guard++ < 100000) {
    out.push(ymd(cur));
    cur = new Date(cur.getTime() + stepDays * 86400000);
  }
  return out;
}

export function addReminder(db, r) {
  const created = { id: r.id || genId("rem"), ...r };
  db.reminders.push(created);
  return created;
}
export function updateReminder(db, id, patch) {
  const r = db.reminders.find(x => x.id === id);
  if (r) Object.assign(r, patch);
  return db;
}
export function deleteReminder(db, id) {
  db.reminders = db.reminders.filter(r => r.id !== id);
  for (const key of Object.keys(db.months)) {
    const m = db.months[key];
    if (m.paidReminders) m.paidReminders = m.paidReminders.filter(x => x !== id);
  }
  return db;
}
export function isReminderPaid(db, monthKey, reminderId) {
  const m = db.months[monthKey];
  return !!(m && m.paidReminders && m.paidReminders.includes(reminderId));
}
export function toggleReminderPaid(db, monthKey, reminderId) {
  ensureMonth(db, monthKey);
  const m = db.months[monthKey];
  if (m.paidReminders.includes(reminderId)) m.paidReminders = m.paidReminders.filter(x => x !== reminderId);
  else m.paidReminders.push(reminderId);
  return db;
}
export function remindersDueInMonth(db, monthKey) {
  return db.reminders
    .filter(r => r.active)
    .map(r => ({ reminder: r, dates: occurrencesInMonth(r, monthKey), paid: isReminderPaid(db, monthKey, r.id) }))
    .filter(x => x.dates.length > 0);
}
export function remindersDueOn(db, dateKey) {
  const monthKey = dateKey.slice(0, 7);
  return db.reminders.filter(r => r.active && !isReminderPaid(db, monthKey, r.id) && occurrencesInMonth(r, monthKey).includes(dateKey));
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseDay(toKey).getTime() - parseDay(fromKey).getTime()) / 86400000);
}

// Helyi (nem UTC) mai dátum YYYY-MM-DD — hogy éjfél körül ne csússzon el a nap.
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Havi összehasonlítás + hó végi becslés (csak az aktuális hónapra ad becslést).
export function monthComparison(db, monthKey, todayK) {
  const ov = monthOverview(db, monthKey);
  const cur = ov.totalExpense;
  const [y, m] = monthKey.split("-").map(Number);
  const prevD = new Date(Date.UTC(y, m - 2, 1));
  const prevKey = `${prevD.getUTCFullYear()}-${String(prevD.getUTCMonth() + 1).padStart(2, "0")}`;
  const prev = monthOverview(db, prevKey).totalExpense;
  const delta = cur - prev;
  const deltaPct = prev > 0 ? Math.round((delta / prev) * 100) : null;
  // projItems: csak a napi (változó) bolti kiadás előrevetítve.
  // projTotal: ehhez egyszer hozzáadva a fix/kötelező (kimenő utalás) kiadás — nem felszorozva.
  let projItems = null, projTotal = null;
  if (todayK && todayK.slice(0, 7) === monthKey) {
    const day = Number(todayK.slice(8, 10));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (day > 0) {
      projItems = Math.round(ov.expenseItems * (daysInMonth / day));
      projTotal = projItems + ov.expenseOut;
    }
  }
  return { current: cur, prev, delta, deltaPct, projItems, projTotal };
}

// Az adott hónap esedékes kötelező kiadásai, kijelzéshez: a ma-hoz legközelebbi
// (lehetőleg soron következő) dátum, a kifizetettség és a sürgősség (<=3 nap, ha nincs fizetve).
export function dueSummaryForMonth(db, monthKey, todayKey) {
  return remindersDueInMonth(db, monthKey).map(({ reminder, dates, paid }) => {
    const date = dates.find(d => d >= todayKey) || dates[dates.length - 1];
    const daysUntil = daysBetween(todayKey, date);
    return { reminder, date, paid, daysUntil, urgent: !paid && daysUntil <= 3 };
  });
}
