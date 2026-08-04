import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, addReminder, updateReminder, deleteReminder,
  toggleReminderPaid, isReminderPaid, occurrencesInMonth, remindersDueInMonth, remindersDueOn,
  daysBetween, dueSummaryForMonth } from "../src/model.js";

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

test("one-off reminder (freq none) occurs only in its start month", () => {
  const r = rem({ freq: "none", startDate: "2026-08-14" });
  assert.deepEqual(occurrencesInMonth(r, "2026-08"), ["2026-08-14"]);
  assert.deepEqual(occurrencesInMonth(r, "2026-09"), []);
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

test("daysBetween counts calendar days", () => {
  assert.equal(daysBetween("2026-08-03", "2026-08-06"), 3);
  assert.equal(daysBetween("2026-08-10", "2026-08-08"), -2);
});

test("dueSummaryForMonth marks urgent within 3 days when unpaid", () => {
  const db = createDatabase();
  addReminder(db, rem({ name: "Hitel", startDate: "2026-01-05" }));   // e havi esedékesség 08-05
  const sum = dueSummaryForMonth(db, "2026-08", "2026-08-03");
  assert.equal(sum.length, 1);
  assert.equal(sum[0].date, "2026-08-05");
  assert.equal(sum[0].daysUntil, 2);
  assert.equal(sum[0].urgent, true);
});

test("dueSummaryForMonth not urgent when far away or paid", () => {
  const db = createDatabase();
  const r = addReminder(db, rem({ name: "TB", startDate: "2026-01-20" })); // 08-20
  let sum = dueSummaryForMonth(db, "2026-08", "2026-08-03");
  assert.equal(sum[0].urgent, false);
  toggleReminderPaid(db, "2026-08", r.id);
  sum = dueSummaryForMonth(db, "2026-08", "2026-08-19");
  assert.equal(sum[0].paid, true);
  assert.equal(sum[0].urgent, false);
});

test("deleteReminder also clears paid marks", () => {
  const db = createDatabase();
  const r = addReminder(db, rem());
  toggleReminderPaid(db, "2026-08", r.id);
  deleteReminder(db, r.id);
  assert.equal(db.reminders.length, 0);
  assert.equal((db.months["2026-08"].paidReminders || []).includes(r.id), false);
});
