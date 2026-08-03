import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, addReminder, updateReminder, deleteReminder,
  toggleReminderPaid, isReminderPaid, occurrencesInMonth, remindersDueInMonth, remindersDueOn } from "../src/model.js";

function rem(over = {}) {
  return { name: "Törlesztő", amount: 50000, note: "", active: true, freq: "monthly", interval: 1, startDate: "2026-01-10", until: null, notifyTime: "09:00", ...over };
}

test("addReminder stores it with an id", () => {
  const db = createDatabase();
  const r = addReminder(db, rem());
  assert.ok(r.id);
  assert.equal(db.reminders.length, 1);
});

test("monthly occurrence lands on the start day-of-month", () => {
  const r = rem({ startDate: "2026-01-10" });
  assert.deepEqual(occurrencesInMonth(r, "2026-08"), ["2026-08-10"]);
});

test("monthly with interval 2 skips odd months from start", () => {
  const r = rem({ startDate: "2026-01-10", interval: 2 });
  assert.deepEqual(occurrencesInMonth(r, "2026-02"), []);
  assert.deepEqual(occurrencesInMonth(r, "2026-03"), ["2026-03-10"]);
});

test("until stops occurrences", () => {
  const r = rem({ startDate: "2026-01-10", until: "2026-05-31" });
  assert.deepEqual(occurrencesInMonth(r, "2026-08"), []);
});

test("weekly lists matching weekdays within the month", () => {
  const r = rem({ freq: "weekly", interval: 1, startDate: "2026-08-03", amount: null });
  const occ = occurrencesInMonth(r, "2026-08");
  assert.deepEqual(occ, ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]);
});

test("inactive reminder yields no occurrences", () => {
  assert.deepEqual(occurrencesInMonth(rem({ active: false }), "2026-08"), []);
});

test("paid toggle and query", () => {
  const db = createDatabase();
  const r = addReminder(db, rem());
  assert.equal(isReminderPaid(db, "2026-08", r.id), false);
  toggleReminderPaid(db, "2026-08", r.id);
  assert.equal(isReminderPaid(db, "2026-08", r.id), true);
  toggleReminderPaid(db, "2026-08", r.id);
  assert.equal(isReminderPaid(db, "2026-08", r.id), false);
});

test("remindersDueInMonth returns active dues with paid flag", () => {
  const db = createDatabase();
  const r = addReminder(db, rem({ startDate: "2026-01-10" }));
  toggleReminderPaid(db, "2026-08", r.id);
  const due = remindersDueInMonth(db, "2026-08");
  assert.equal(due.length, 1);
  assert.deepEqual(due[0].dates, ["2026-08-10"]);
  assert.equal(due[0].paid, true);
});

test("remindersDueOn returns only unpaid reminders due that day", () => {
  const db = createDatabase();
  const r = addReminder(db, rem({ startDate: "2026-01-10" }));
  assert.equal(remindersDueOn(db, "2026-08-10").length, 1);
  toggleReminderPaid(db, "2026-08", r.id);
  assert.equal(remindersDueOn(db, "2026-08-10").length, 0);
  assert.equal(remindersDueOn(db, "2026-08-11").length, 0);
});

test("deleteReminder also clears paid marks", () => {
  const db = createDatabase();
  const r = addReminder(db, rem());
  toggleReminderPaid(db, "2026-08", r.id);
  deleteReminder(db, r.id);
  assert.equal(db.reminders.length, 0);
  assert.equal((db.months["2026-08"].paidReminders || []).includes(r.id), false);
});
