import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, addItem, addTransfer } from "../src/model.js";
import { sheetXml, expenseRows, transferRows, buildXlsxBytes } from "../src/xlsx.js";

test("sheetXml puts numbers as numeric cells and strings as inlineStr, escaping XML", () => {
  const xml = sheetXml([["Név", "Ár"], ["Alma & <b>", 300]]);
  assert.match(xml, /<c r="A1" t="inlineStr"><is><t[^>]*>Név<\/t>/);
  assert.match(xml, /Alma &amp; &lt;b&gt;/);
  assert.match(xml, /<c r="B2"><v>300<\/v><\/c>/);
});

test("expenseRows builds header + numeric qty/price", () => {
  const db = createDatabase();
  const c = db.categories[0];
  addItem(db, "2026-08", { name: "Tej", qty: 2, price: 640, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: c.id });
  const rows = expenseRows(db, "2026-08");
  assert.deepEqual(rows[0], ["Hónap", "Dátum", "Kategória", "Név", "Db", "Ár", "Üzlet", "Fizetés"]);
  assert.equal(rows[1][4], 2);      // qty szám
  assert.equal(rows[1][5], 640);    // ár szám
  assert.equal(rows[1][2], c.name);
});

test("transferRows renders direction in Hungarian with numeric amount", () => {
  const db = createDatabase();
  addTransfer(db, "2026-08", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-08-01", partner: "Munka", note: "" });
  const rows = transferRows(db, "2026-08");
  assert.equal(rows[1][2], "Bejövő");
  assert.equal(rows[1][3], "Utalás"); // Mód (alap: utalás)
  assert.equal(rows[1][5], 400000);
});

test("buildXlsxBytes returns a ZIP (PK header) with content", () => {
  const bytes = buildXlsxBytes([{ name: "Kiadások", rows: [["A", 1]] }, { name: "Utalások", rows: [["B", 2]] }]);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 100);
  assert.deepEqual([bytes[0], bytes[1], bytes[2], bytes[3]], [0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
});

test("transferRows labels swap rows as Átvezetés with kind in Mód", () => {
  const db = createDatabase();
  addTransfer(db, "2026-08", { dir: "swap", kind: "deposit", name: "Befizetés kártyára", amount: 5000, date: "2026-08-04", partner: "", note: "" });
  const rows = transferRows(db, "2026-08");
  assert.equal(rows[1][2], "Átvezetés");
  assert.equal(rows[1][3], "Befizetés kártyára");
});
