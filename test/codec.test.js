import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeImport, decodeImport } from "../src/codec.js";

test("encode then decode round-trips (with UTF-8 names)", () => {
  const payload = { month: "2026-08", items: [
    { name: "Tejföl", qty: 2, price: 780, store: "Lidl", date: "2026-08-03", payment: "card", category: "Élelmiszer" },
  ]};
  const code = encodeImport(payload);
  assert.equal(typeof code, "string");
  const back = decodeImport(code);
  assert.deepEqual(back, payload);
});

test("decode fills defaults for qty and payment", () => {
  const code = encodeImport({ month: "2026-08", items: [ { name: "Kenyér", price: 500, category: "Élelmiszer" } ] });
  const back = decodeImport(code);
  assert.equal(back.items[0].qty, 1);
  assert.equal(back.items[0].payment, "card");
  assert.equal(back.items[0].store, "");
});

test("decode accepts plain JSON too", () => {
  const back = decodeImport(JSON.stringify({ month: "2026-08", items: [{ name: "Alma", price: 300, category: "Élelmiszer" }] }));
  assert.equal(back.month, "2026-08");
  assert.equal(back.items[0].name, "Alma");
  assert.equal(back.items[0].qty, 1);
});

test("decode throws on garbage", () => {
  assert.throws(() => decodeImport("nem-valós-kód!!!"));
});

test("decode throws when an item misses name or price", () => {
  const code = encodeImport({ month: "2026-08", items: [ { name: "X" } ] });
  assert.throws(() => decodeImport(code), /price/i);
});

test("decodeImport tolerates AI-style answers: code fences and surrounding prose", () => {
  const payload = '{"month":"2026-08","items":[{"name":"Tej","qty":1,"price":500,"store":"Lidl","date":"2026-08-05","payment":"card","category":"Élelmiszer"}]}';
  const fenced = "Íme a kért JSON:\n```json\n" + payload + "\n```\nSzólj, ha kell még valami!";
  const got = decodeImport(fenced);
  assert.equal(got.month, "2026-08");
  assert.equal(got.items[0].name, "Tej");
  const prose = "Természetesen! " + payload + " Remélem, segítettem.";
  assert.equal(decodeImport(prose).items[0].price, 500);
});
