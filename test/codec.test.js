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

test("decode throws on garbage", () => {
  assert.throws(() => decodeImport("nem-valós-kód!!!"));
});

test("decode throws when an item misses name or price", () => {
  const code = encodeImport({ month: "2026-08", items: [ { name: "X" } ] });
  assert.throws(() => decodeImport(code), /price/i);
});
