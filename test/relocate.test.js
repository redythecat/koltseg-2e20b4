import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, addItem, monthOfDate, misplacedItems, relocateMisplacedItems, relocateItem } from "../src/model.js";

function seed() {
  const db = createDatabase();
  const cat = db.categories[0].id;
  addItem(db, "2026-09", { id: "a", name: "Tej", qty: 1, price: 400, date: "2026-09-20", categoryId: cat });
  addItem(db, "2026-09", { id: "b", name: "Kenyér", qty: 1, price: 600, date: "2026-10-03", categoryId: cat });
  addItem(db, "2026-09", { id: "c", name: "Sajt", qty: 1, price: 900, date: "2026-10-05", categoryId: cat });
  addItem(db, "2026-09", { id: "d", name: "Dátum nélkül", qty: 1, price: 100, date: "", categoryId: cat });
  return db;
}

test("monthOfDate returns YYYY-MM only for a full YYYY-MM-DD date", () => {
  assert.equal(monthOfDate("2026-10-03"), "2026-10");
  assert.equal(monthOfDate(""), null);
  assert.equal(monthOfDate(undefined), null);
  assert.equal(monthOfDate("2026.10.03"), null);
});

test("misplacedItems lists items whose date falls in another month, ignoring undated ones", () => {
  const db = seed();
  assert.deepEqual(misplacedItems(db, "2026-09").map(i => i.id), ["b", "c"]);
  assert.deepEqual(misplacedItems(db, "2026-11"), []);
});

test("relocateMisplacedItems moves them to their date's month and keeps the rest", () => {
  const db = seed();
  const moved = relocateMisplacedItems(db, "2026-09");
  assert.deepEqual(moved, { count: 2, months: ["2026-10"] });
  assert.deepEqual(db.months["2026-09"].items.map(i => i.id), ["a", "d"]);
  assert.deepEqual(db.months["2026-10"].items.map(i => i.id), ["b", "c"]);
  assert.equal(db.months["2026-10"].items[0].price, 600);
  assert.deepEqual(misplacedItems(db, "2026-09"), []);
});

test("relocateItem moves a single item when its date month differs, otherwise no-op", () => {
  const db = seed();
  assert.equal(relocateItem(db, "2026-09", "a"), null);
  assert.equal(relocateItem(db, "2026-09", "b"), "2026-10");
  assert.ok(!db.months["2026-09"].items.some(i => i.id === "b"));
  assert.ok(db.months["2026-10"].items.some(i => i.id === "b"));
});
