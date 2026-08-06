import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderToIcs } from "../src/ics.js";

const base = { id: "rem_1", name: "Törlesztő", amount: 50000, note: "lakás", active: true, freq: "monthly", interval: 1, startDate: "2026-08-10", until: null, notifyTime: "09:00" };

test("ics contains calendar, event, rrule, summary and alarm", () => {
  const s = reminderToIcs(base);
  assert.match(s, /BEGIN:VCALENDAR/);
  assert.match(s, /BEGIN:VEVENT/);
  assert.match(s, /DTSTART:20260810T090000/);
  assert.match(s, /RRULE:FREQ=MONTHLY;INTERVAL=1/);
  assert.match(s, /SUMMARY:Törlesztő – 50000 Ft/);
  assert.match(s, /BEGIN:VALARM/);
  assert.match(s, /END:VCALENDAR/);
  assert.ok(s.includes("\r\n"));
});

test("one-off reminder (freq none) has no RRULE", () => {
  const s = reminderToIcs({ ...base, freq: "none" });
  assert.ok(!/RRULE/.test(s));
  assert.match(s, /BEGIN:VEVENT/);
  assert.match(s, /BEGIN:VALARM/);
});

test("weekly with until encodes UNTIL, and no-amount omits price", () => {
  const s = reminderToIcs({ ...base, freq: "weekly", interval: 2, until: "2026-12-31", amount: null });
  assert.match(s, /RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235900Z/);
  assert.match(s, /SUMMARY:Törlesztő\r\n/);
});

test("reminderToGoogleUrl builds a prefilled Google Calendar link with recurrence", async () => {
  const { reminderToGoogleUrl } = await import("../src/ics.js");
  const url = reminderToGoogleUrl({ id: "r1", name: "Törlesztő", amount: 40000, note: "hitel",
    freq: "monthly", interval: 2, startDate: "2026-08-10", until: "2027-01-01", notify: true, notifyTime: "09:00" });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("text"), "Törlesztő – 40000 Ft");
  assert.equal(u.searchParams.get("dates"), "20260810T090000/20260810T093000");
  assert.equal(u.searchParams.get("recur"), "RRULE:FREQ=MONTHLY;INTERVAL=2;UNTIL=20270101T235900Z");
  assert.equal(u.searchParams.get("details"), "hitel");
});

test("reminderToGoogleUrl omits recurrence for one-off and handles hour rollover", async () => {
  const { reminderToGoogleUrl } = await import("../src/ics.js");
  const url = reminderToGoogleUrl({ id: "r2", name: "TB", freq: "none", startDate: "2026-08-10", notifyTime: "23:45" });
  const u = new URL(url);
  assert.equal(u.searchParams.get("recur"), null);
  assert.equal(u.searchParams.get("dates"), "20260810T234500/20260810T235900");
});
