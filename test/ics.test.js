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

test("weekly with until encodes UNTIL, and no-amount omits price", () => {
  const s = reminderToIcs({ ...base, freq: "weekly", interval: 2, until: "2026-12-31", amount: null });
  assert.match(s, /RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235900Z/);
  assert.match(s, /SUMMARY:Törlesztő\r\n/);
});
