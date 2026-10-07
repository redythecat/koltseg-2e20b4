import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabase, addItem, addTransfer, addReminder, deleteReminder, toggleReminderPaid,
  misplacedTransfers, relocateTransfer, relocateMisplacedTransfers,
  isPerOccurrence, paidKey, isOccurrencePaid, toggleOccurrencePaid,
  dueSummaryForMonth, remindersDueOn, remindersDueInMonth, monthComparison, unpaidMandatoryAmount,
  findDuplicateItem, findReceiptSumMatch, analyzeImport,
} from "../src/model.js";

const weekly = (db, extra = {}) => addReminder(db, { name: "Takarítás", amount: 5000, active: true, freq: "weekly", interval: 1, startDate: "2026-10-02", until: "", ...extra });
const monthly = (db, extra = {}) => addReminder(db, { name: "Törlesztő", amount: 80000, active: true, freq: "monthly", interval: 1, startDate: "2026-01-10", until: "", ...extra });

// --- 1. Pénzmozgás a dátuma szerinti hónapba ---

test("misplacedTransfers / relocate move transfers to their date's month", () => {
  const db = createDatabase();
  addTransfer(db, "2026-09", { id: "t1", dir: "out", name: "Rezsi", amount: 1000, date: "2026-09-10" });
  addTransfer(db, "2026-09", { id: "t2", dir: "in", name: "Fizetés", amount: 5000, date: "2026-10-05" });
  assert.deepEqual(misplacedTransfers(db, "2026-09").map(t => t.id), ["t2"]);
  assert.equal(relocateTransfer(db, "2026-09", "t1"), null);
  assert.deepEqual(relocateMisplacedTransfers(db, "2026-09"), { count: 1, months: ["2026-10"] });
  assert.deepEqual(db.months["2026-09"].transfers.map(t => t.id), ["t1"]);
  assert.deepEqual(db.months["2026-10"].transfers.map(t => t.id), ["t2"]);
});

// --- 3. Heti/napi kötelező kiadás alkalmanként ---

test("weekly reminders are per-occurrence; monthly ones keep the plain id key", () => {
  const db = createDatabase();
  const w = weekly(db), m = monthly(db);
  assert.equal(isPerOccurrence(w), true);
  assert.equal(isPerOccurrence(m), false);
  assert.equal(paidKey(w, "2026-10-09"), `${w.id}@2026-10-09`);
  assert.equal(paidKey(m, "2026-10-10"), m.id);
});

test("dueSummaryForMonth lists every weekly occurrence; totals multiply by occurrences", () => {
  const db = createDatabase();
  weekly(db); monthly(db);
  const rows = dueSummaryForMonth(db, "2026-10", "2026-10-07");
  assert.equal(rows.filter(r => r.reminder.name === "Takarítás").length, 5);
  assert.equal(rows.filter(r => r.reminder.name === "Törlesztő").length, 1);
  assert.equal(rows.reduce((s, r) => s + r.reminder.amount, 0), 5 * 5000 + 80000);
});

test("toggleOccurrencePaid marks one occurrence only", () => {
  const db = createDatabase();
  const w = weekly(db);
  assert.equal(toggleOccurrencePaid(db, "2026-10", w, "2026-10-09"), true);
  assert.equal(isOccurrencePaid(db, "2026-10", w, "2026-10-09"), true);
  assert.equal(isOccurrencePaid(db, "2026-10", w, "2026-10-16"), false);
  const rows = dueSummaryForMonth(db, "2026-10", "2026-10-07");
  assert.equal(rows.filter(r => r.paid).length, 1);
  assert.equal(toggleOccurrencePaid(db, "2026-10", w, "2026-10-09"), false);
});

test("legacy whole-month paid mark on a weekly reminder counts for all, and unticking one keeps the others", () => {
  const db = createDatabase();
  const w = weekly(db);
  toggleReminderPaid(db, "2026-10", w.id);                 // régi adat: egész hónap kifizetve
  assert.equal(dueSummaryForMonth(db, "2026-10", "2026-10-07").every(r => r.paid), true);
  assert.equal(toggleOccurrencePaid(db, "2026-10", w, "2026-10-16"), false);
  const rows = dueSummaryForMonth(db, "2026-10", "2026-10-07");
  assert.deepEqual(rows.filter(r => !r.paid).map(r => r.date), ["2026-10-16"]);
});

test("remindersDueOn respects per-occurrence paid marks; remindersDueInMonth.paid = all paid", () => {
  const db = createDatabase();
  const w = weekly(db);
  toggleOccurrencePaid(db, "2026-10", w, "2026-10-09");
  assert.equal(remindersDueOn(db, "2026-10-09").length, 0);
  assert.equal(remindersDueOn(db, "2026-10-16").length, 1);
  assert.equal(remindersDueInMonth(db, "2026-10")[0].paid, false);
});

test("deleteReminder also clears per-occurrence paid marks", () => {
  const db = createDatabase();
  const w = weekly(db);
  toggleOccurrencePaid(db, "2026-10", w, "2026-10-09");
  deleteReminder(db, w.id);
  assert.deepEqual(db.months["2026-10"].paidReminders, []);
});

// --- 7. Becslés: a még ki nem fizetett kötelezők is benne vannak ---

test("unpaidMandatoryAmount sums unpaid occurrences with an amount", () => {
  const db = createDatabase();
  const w = weekly(db); monthly(db);
  addReminder(db, { name: "Összeg nélkül", amount: null, active: true, freq: "monthly", interval: 1, startDate: "2026-01-01" });
  toggleOccurrencePaid(db, "2026-10", w, "2026-10-02");
  assert.equal(unpaidMandatoryAmount(db, "2026-10", "2026-10-07"), 4 * 5000 + 80000);
});

test("unpaidMandatoryAmount skips occurrences already recorded as a transfer (no double count)", () => {
  const db = createDatabase();
  const w = weekly(db), m = monthly(db);
  addTransfer(db, "2026-10", { dir: "out", name: "Törlesztő", amount: 80000, date: "2026-10-03", mandatory: true, note: "kötelező kiadás" });
  addTransfer(db, "2026-10", { dir: "out", name: "Takarítás", amount: 5000, date: "2026-10-09", reminderKey: paidKey(w, "2026-10-09") });
  assert.equal(unpaidMandatoryAmount(db, "2026-10", "2026-10-07"), 4 * 5000);
  assert.ok(m);
});

test("monthComparison.projTotal adds still-unpaid mandatory amounts once", () => {
  const db = createDatabase();
  const cat = db.categories[0].id;
  addItem(db, "2026-10", { name: "Kaja", qty: 1, price: 1000, date: "2026-10-05", categoryId: cat });
  monthly(db);
  const cmp = monthComparison(db, "2026-10", "2026-10-10");
  assert.equal(cmp.projItems, 3100);                       // 1000 * 31/10
  assert.equal(cmp.mandatoryLeft, 80000);
  assert.equal(cmp.projTotal, 3100 + 80000);
});

// --- 5. Duplikátum-figyelés ---

function seedReceipt() {
  const db = createDatabase();
  const cat = db.categories[0].id;
  addItem(db, "2026-10", { id: "a", name: "Tej", qty: 1, price: 400, store: "Lidl", date: "2026-10-05", categoryId: cat });
  addItem(db, "2026-10", { id: "b", name: "Kenyér", qty: 1, price: 600, store: "Lidl", date: "2026-10-05", categoryId: cat });
  return db;
}

test("findDuplicateItem matches same name (case/space-insensitive), price and date", () => {
  const db = seedReceipt();
  assert.equal(findDuplicateItem(db, { name: " tej ", price: 400, date: "2026-10-05" }).id, "a");
  assert.equal(findDuplicateItem(db, { name: "Tej", price: 400, date: "2026-10-06" }), null);
  assert.equal(findDuplicateItem(db, { name: "Tej", price: 450, date: "2026-10-05" }), null);
});

test("findReceiptSumMatch finds a same-day receipt whose items add up to the amount", () => {
  const db = seedReceipt();
  assert.deepEqual(findReceiptSumMatch(db, "2026-10-05", 1000), { store: "Lidl", count: 2 });
  assert.equal(findReceiptSumMatch(db, "2026-10-05", 999), null);
  assert.equal(findReceiptSumMatch(db, "2026-10-06", 1000), null);
});

test("analyzeImport flags duplicates and an existing wallet total for the receipt", () => {
  const db = seedReceipt();
  addItem(db, "2026-10", { id: "w", name: "Spar vásárlás", qty: 1, price: 2500, store: "Spar", date: "2026-10-06", categoryId: db.categories[0].id });
  const res = analyzeImport(db, [
    { name: "Tej", price: 400, store: "Lidl", date: "2026-10-05" },
    { name: "Sajt", price: 1500, store: "Spar", date: "2026-10-06" },
    { name: "Sonka", price: 1000, store: "Spar", date: "2026-10-06" },
  ]);
  assert.deepEqual(res.dup.map(d => d && d.id), ["a", null, null]);
  assert.equal(res.totalMatches.length, 1);
  assert.equal(res.totalMatches[0].item.id, "w");
  assert.equal(res.totalMatches[0].sum, 2500);
  assert.equal(res.sumMatch, null);
});

test("analyzeImport: a single-row import equal to an existing receipt's total is flagged", () => {
  const db = seedReceipt();
  const res = analyzeImport(db, [{ name: "Lidl", price: 1000, store: "Lidl", date: "2026-10-05" }]);
  assert.deepEqual(res.sumMatch, { store: "Lidl", count: 2 });
});
