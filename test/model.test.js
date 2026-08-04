import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabase, ensureMonth, DEFAULT_CATEGORIES, genId,
  addItem, updateItem, moveItem, deleteItem,
  addCategory, renameCategory, deleteCategory, reorderCategories,
  addTransfer, updateTransfer, deleteTransfer,
  categoryTotal, monthOverview, monthComparison, setCategoryBudget,
} from "../src/model.js";

test("createDatabase seeds default categories, reminders, settings and empty maps", () => {
  const db = createDatabase();
  assert.equal(db.version, 1);
  assert.equal(db.categories.length, DEFAULT_CATEGORIES.length);
  assert.deepEqual(db.categories.map(c => c.name), DEFAULT_CATEGORIES);
  assert.deepEqual(db.categories.map(c => c.order), DEFAULT_CATEGORIES.map((_, i) => i));
  assert.ok(db.categories.every(c => typeof c.id === "string" && c.id.length > 0));
  assert.deepEqual(db.months, {});
  assert.deepEqual(db.reminders, []);
  assert.deepEqual(db.settings, { theme: "system", notifications: false, accent: "blue", collapsed: {}, fontScale: "normal" });
  assert.deepEqual(db.templates, { items: [], transfers: [] });
});

test("ensureMonth creates an empty month once and is idempotent", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  assert.deepEqual(db.months["2026-08"], { items: [], transfers: [], paidReminders: [] });
  db.months["2026-08"].items.push({ id: "x" });
  ensureMonth(db, "2026-08");
  assert.equal(db.months["2026-08"].items.length, 1);
});

test("genId returns unique prefixed ids", () => {
  const a = genId("cat");
  const b = genId("cat");
  assert.ok(a.startsWith("cat_"));
  assert.notEqual(a, b);
});

function baseDb() {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  return db;
}
const catId = (db) => db.categories[0].id;

test("addItem inserts item and returns it with an id", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Tej", qty: 2, price: 640, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: catId(db) });
  assert.ok(it.id);
  assert.equal(db.months["2026-08"].items.length, 1);
  assert.equal(db.months["2026-08"].items[0].name, "Tej");
});

test("addItem upserts a template keyed by name+categoryId", () => {
  const db = baseDb();
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  addItem(db, "2026-08", { name: "Tej", qty: 3, price: 900, store: "Aldi", date: "2026-08-04", payment: "card", categoryId: catId(db) });
  const tpls = db.templates.items.filter(t => t.name === "Tej");
  assert.equal(tpls.length, 1);
  assert.equal(tpls[0].lastPrice, 300); // egységár: ceil(900/3)
  assert.equal(tpls[0].lastQty, 1);
  assert.equal(tpls[0].store, "Aldi");
});

test("updateItem patches fields", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  updateItem(db, "2026-08", it.id, { price: 350, qty: 2 });
  const stored = db.months["2026-08"].items[0];
  assert.equal(stored.price, 350);
  assert.equal(stored.qty, 2);
});

test("moveItem changes categoryId", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Sör", qty: 1, price: 500, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: db.categories[0].id });
  moveItem(db, "2026-08", it.id, db.categories[1].id);
  assert.equal(db.months["2026-08"].items[0].categoryId, db.categories[1].id);
});

test("deleteItem removes the item", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  deleteItem(db, "2026-08", it.id);
  assert.equal(db.months["2026-08"].items.length, 0);
});

test("addCategory appends with next order", () => {
  const db = createDatabase();
  const c = addCategory(db, "Rezsi");
  assert.equal(c.name, "Rezsi");
  assert.equal(c.order, db.categories.length - 1);
});

test("renameCategory changes the name", () => {
  const db = createDatabase();
  const id = db.categories[0].id;
  renameCategory(db, id, "Kaja");
  assert.equal(db.categories.find(c => c.id === id).name, "Kaja");
});

test("deleteCategory with reassign moves items across all months", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  const from = db.categories[0].id;
  const to = db.categories[1].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: from });
  deleteCategory(db, from, to);
  assert.ok(!db.categories.find(c => c.id === from));
  assert.equal(db.months["2026-08"].items[0].categoryId, to);
});

test("deleteCategory without reassign deletes its items", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  const from = db.categories[0].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: from });
  deleteCategory(db, from, null);
  assert.ok(!db.categories.find(c => c.id === from));
  assert.equal(db.months["2026-08"].items.length, 0);
});

test("reorderCategories sets order from an id list", () => {
  const db = createDatabase();
  const ids = db.categories.map(c => c.id);
  const newOrder = [ids[2], ids[0], ids[1], ids[3], ids[4]];
  reorderCategories(db, newOrder);
  assert.deepEqual(db.categories.map(c => c.id), newOrder);
  assert.deepEqual(db.categories.map(c => c.order), [0, 1, 2, 3, 4]);
});

test("item template stores unit price rounded up, qty reset to 1", () => {
  const db = baseDb();
  addItem(db, "2026-08", { name: "Tej", qty: 3, price: 1000, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  const t = db.templates.items.find(x => x.name === "Tej");
  assert.equal(t.lastPrice, 334); // ceil(1000/3)
  assert.equal(t.lastQty, 1);
  // a tényleges tétel ára marad a sor összege
  assert.equal(db.months["2026-08"].items[0].price, 1000);
});

test("addTransfer stores and upserts template", () => {
  const db = createDatabase();
  const t = addTransfer(db, "2026-08", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-08-01", partner: "Munkahely", note: "" });
  assert.ok(t.id);
  assert.equal(db.months["2026-08"].transfers.length, 1);
  const tpl = db.templates.transfers.find(x => x.dir === "in" && x.name === "Fizetés");
  assert.equal(tpl.lastAmount, 400000);
  assert.equal(tpl.partner, "Munkahely");
});

test("updateTransfer patches and deleteTransfer removes", () => {
  const db = createDatabase();
  const t = addTransfer(db, "2026-08", { dir: "out", name: "Albérlet", amount: 150000, date: "2026-08-05", partner: "Főbérlő", note: "" });
  updateTransfer(db, "2026-08", t.id, { amount: 160000 });
  assert.equal(db.months["2026-08"].transfers[0].amount, 160000);
  deleteTransfer(db, "2026-08", t.id);
  assert.equal(db.months["2026-08"].transfers.length, 0);
});

test("categoryTotal sums item prices in a category", () => {
  const db = createDatabase();
  const c = db.categories[0].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: c });
  addItem(db, "2026-08", { name: "Kenyér", qty: 1, price: 500, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: c });
  assert.equal(categoryTotal(db, "2026-08", c), 800);
});

test("monthOverview computes income, expense, balance, splits", () => {
  const db = createDatabase();
  const c0 = db.categories[0].id;
  const c1 = db.categories[1].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: c0 });
  addItem(db, "2026-08", { name: "Sör", qty: 1, price: 700, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: c1 });
  addTransfer(db, "2026-08", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-08-01", partner: "", note: "" });
  addTransfer(db, "2026-08", { dir: "out", name: "Albérlet", amount: 150000, date: "2026-08-05", partner: "", note: "" });
  const o = monthOverview(db, "2026-08");
  assert.equal(o.income, 400000);
  assert.equal(o.expenseItems, 1000);
  assert.equal(o.expenseOut, 150000);
  assert.equal(o.totalExpense, 151000);
  assert.equal(o.balance, 249000);
  assert.equal(o.cash, 300);
  assert.equal(o.card, 700);
  const b0 = o.byCategory.find(x => x.categoryId === c0);
  assert.equal(b0.sum, 300);
  assert.ok(Math.abs(b0.share - 0.3) < 1e-9);
});

test("monthComparison: projItems extrapolates bolti, projTotal adds fixed once", () => {
  const db = createDatabase();
  const c = db.categories[0].id;
  addItem(db, "2026-07", { name: "x", qty: 1, price: 1000, store: "", date: "2026-07-10", payment: "card", categoryId: c });
  addItem(db, "2026-08", { name: "y", qty: 1, price: 500, store: "", date: "2026-08-05", payment: "card", categoryId: c });
  addTransfer(db, "2026-08", { dir: "out", name: "Törlesztő", amount: 50000, date: "2026-08-05", partner: "", note: "" });
  const cmp = monthComparison(db, "2026-08", "2026-08-10");
  assert.equal(cmp.prev, 1000);
  assert.equal(cmp.current, 50500);          // 500 bolti + 50000 utalás
  assert.equal(cmp.projItems, 1550);         // 500 * 31/10 (csak bolti, felszorozva)
  assert.equal(cmp.projTotal, 51550);        // 1550 + 50000 (fix egyszer, nem felszorozva)
});

test("monthComparison gives no projection for a non-current month", () => {
  const db = createDatabase();
  const cmp = monthComparison(db, "2026-08", "2026-09-01");
  assert.equal(cmp.projItems, null);
  assert.equal(cmp.projTotal, null);
});

test("setCategoryBudget sets and clears budget", () => {
  const db = createDatabase();
  const id = db.categories[0].id;
  setCategoryBudget(db, id, 80000);
  assert.equal(db.categories[0].budget, 80000);
  setCategoryBudget(db, id, "");
  assert.equal(db.categories[0].budget, null);
  setCategoryBudget(db, id, -5);
  assert.equal(db.categories[0].budget, null);
});

test("monthOverview on empty month is all zeros", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-09");
  const o = monthOverview(db, "2026-09");
  assert.equal(o.income, 0);
  assert.equal(o.totalExpense, 0);
  assert.equal(o.balance, 0);
  assert.equal(o.byCategory.every(x => x.sum === 0 && x.share === 0), true);
});

test("transfer templates get ids and can be updated/deleted", async () => {
  const { deleteTransferTemplate, updateTransferTemplate } = await import("../src/model.js");
  const db = createDatabase();
  addTransfer(db, "2026-08", { dir: "out", name: "Albérlet", amount: 150000, date: "2026-08-05", partner: "Főbérlő", note: "" });
  const tpl = db.templates.transfers.find(x => x.name === "Albérlet");
  assert.ok(tpl.id && tpl.id.startsWith("ttpl"));
  updateTransferTemplate(db, tpl.id, { name: "Lakbér", lastAmount: 160000, partner: "Új főbérlő", dir: "out" });
  assert.equal(db.templates.transfers[0].name, "Lakbér");
  assert.equal(db.templates.transfers[0].lastAmount, 160000);
  deleteTransferTemplate(db, tpl.id);
  assert.equal(db.templates.transfers.length, 0);
});

test("yearTotals splits shop items and mandatory (outgoing transfers) per year", async () => {
  const { yearTotals } = await import("../src/model.js");
  const db = createDatabase();
  const cat = db.categories[0].id;
  addItem(db, "2026-01", { name: "Tej", price: 500, qty: 1, categoryId: cat, date: "2026-01-10", store: "", payment: "card", note: "" });
  addItem(db, "2026-07", { name: "Sajt", price: 1500, qty: 1, categoryId: cat, date: "2026-07-10", store: "", payment: "cash", note: "" });
  addTransfer(db, "2026-03", { dir: "out", name: "Törlesztő", amount: 50000, date: "2026-03-05", partner: "", note: "" });
  addTransfer(db, "2026-03", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-03-01", partner: "", note: "" });
  addItem(db, "2025-12", { name: "Régi", price: 9999, qty: 1, categoryId: cat, date: "2025-12-10", store: "", payment: "card", note: "" });
  const yt = yearTotals(db, "2026");
  assert.equal(yt.shop, 2000);
  assert.equal(yt.mandatory, 50000);
  assert.equal(yt.total, 52000);
  assert.equal(yt.cash, 1500); // Sajt kp-val
  assert.equal(yt.card, 500);  // Tej kártyával
});

test("swap transfers are excluded from sums and create no template", async () => {
  const { yearTotals } = await import("../src/model.js");
  const db = createDatabase();
  addTransfer(db, "2026-08", { dir: "swap", kind: "withdraw", name: "Készpénzfelvétel", amount: 20000, date: "2026-08-04", partner: "", note: "" });
  addTransfer(db, "2026-08", { dir: "out", name: "Albérlet", amount: 150000, date: "2026-08-05", partner: "", note: "" });
  const o = monthOverview(db, "2026-08");
  assert.equal(o.expenseOut, 150000); // az átvezetés nincs benne
  assert.equal(o.income, 0);
  assert.equal(o.totalExpense, 150000);
  const yt = yearTotals(db, "2026");
  assert.equal(yt.mandatory, 150000);
  assert.equal(db.templates.transfers.length, 1); // csak az Albérlet, a swap nem
  assert.equal(db.templates.transfers[0].name, "Albérlet");
});
