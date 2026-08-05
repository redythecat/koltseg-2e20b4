import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabase, addItem, filterRange, emptyFilters, dateBounds,
  hasActiveFilters, matchesFilters, isCrossMonth, collectItems,
} from "../src/model.js";

function seed() {
  const db = createDatabase();
  const [c0, c1] = db.categories.map(c => c.id);
  addItem(db, "2026-07", { name: "Régi tej", price: 400, qty: 1, categoryId: c0, date: "2026-07-20", store: "Lidl", payment: "card", note: "" });
  addItem(db, "2026-08", { name: "Tej", price: 500, qty: 1, categoryId: c0, date: "2026-08-04", store: "Lidl", payment: "card", note: "" });
  addItem(db, "2026-08", { name: "Sajt", price: 1500, qty: 1, categoryId: c0, date: "2026-08-12", store: "Aldi", payment: "cash", note: "" });
  addItem(db, "2026-08", { name: "Sampon", price: 900, qty: 1, categoryId: c1, date: "2026-08-04", store: "Rossmann", payment: "card", note: "" });
  return { db, c0, c1 };
}

test("filterRange collects stores and max price across all months", () => {
  const { db } = seed();
  const r = filterRange(db);
  assert.deepEqual(r.stores, ["Aldi", "Lidl", "Rossmann"]);
  assert.equal(r.maxPrice, 1500);
});

test("emptyFilters is inactive; any selection activates", () => {
  const f = emptyFilters();
  assert.equal(hasActiveFilters(f, 1500), false);
  assert.equal(hasActiveFilters({ ...f, stores: ["Lidl"] }, 1500), true);
  assert.equal(hasActiveFilters({ ...f, day: "2026-08-04" }, 1500), true);
  assert.equal(hasActiveFilters({ ...f, min: 0, max: 1500 }, 1500), false, "a teljes 0..max sáv nem szűrés");
  assert.equal(hasActiveFilters({ ...f, min: 600, max: 1500 }, 1500), true);
  assert.equal(hasActiveFilters({ ...f, min: 0, max: 1000 }, 1500), true);
});

test("dateBounds handles single day and range", () => {
  assert.deepEqual(dateBounds({ dateMode: "day", day: "2026-08-04" }), { from: "2026-08-04", to: "2026-08-04" });
  assert.deepEqual(dateBounds({ dateMode: "day", day: "" }), { from: "", to: "" });
  assert.deepEqual(dateBounds({ dateMode: "range", from: "2026-08-01", to: "2026-08-10" }), { from: "2026-08-01", to: "2026-08-10" });
});

test("multi-select store and category filters use OR within a filter, AND across filters", () => {
  const { db, c0 } = seed();
  const items = db.months["2026-08"].items;
  const f = { ...emptyFilters(), stores: ["Lidl", "Aldi"] };
  assert.deepEqual(items.filter(i => matchesFilters(i, f, 1500)).map(i => i.name), ["Tej", "Sajt"]);
  const f2 = { ...f, categoryIds: [c0], payments: ["cash"] };
  assert.deepEqual(items.filter(i => matchesFilters(i, f2, 1500)).map(i => i.name), ["Sajt"]);
});

test("price filter respects min and max, and ignores max when it equals the range top", () => {
  const { db } = seed();
  const items = db.months["2026-08"].items;
  const min = { ...emptyFilters(), min: 900 };
  assert.deepEqual(items.filter(i => matchesFilters(i, min, 1500)).map(i => i.name), ["Sajt", "Sampon"]);
  const max = { ...emptyFilters(), max: 900 };
  assert.deepEqual(items.filter(i => matchesFilters(i, max, 1500)).map(i => i.name), ["Tej", "Sampon"]);
  const both = { ...emptyFilters(), min: 600, max: 1000 };
  assert.deepEqual(items.filter(i => matchesFilters(i, both, 1500)).map(i => i.name), ["Sampon"]);
});

test("a date filter searches every month, without one only the shown month", () => {
  const { db } = seed();
  const none = emptyFilters();
  assert.equal(isCrossMonth(none), false);
  assert.deepEqual(collectItems(db, "2026-08", none, 1500).map(i => i.name), ["Tej", "Sajt", "Sampon"]);

  const july = { ...emptyFilters(), dateMode: "day", day: "2026-07-20" };
  assert.equal(isCrossMonth(july), true);
  const got = collectItems(db, "2026-08", july, 1500);
  assert.deepEqual(got.map(i => i.name), ["Régi tej"], "másik hónap napja is megtalálható");
  assert.equal(got[0].monthKey, "2026-07", "tudjuk, melyik hónapból jött");

  // júl. 1. – aug. 5.: a júliusi tétel, valamint az aug. 4-i Tej és Sampon (a 12-i Sajt nem)
  const span = { ...emptyFilters(), dateMode: "range", from: "2026-07-01", to: "2026-08-05" };
  assert.deepEqual(collectItems(db, "2026-08", span, 1500).map(i => i.name), ["Régi tej", "Tej", "Sampon"]);
});

test("items without a date are excluded by a date filter", () => {
  const db = createDatabase();
  addItem(db, "2026-08", { name: "Dátum nélküli", price: 100, qty: 1, categoryId: db.categories[0].id, date: "", store: "", payment: "card", note: "" });
  const f = { ...emptyFilters(), dateMode: "day", day: "2026-08-04" };
  assert.deepEqual(collectItems(db, "2026-08", f, 100).map(i => i.name), []);
});
