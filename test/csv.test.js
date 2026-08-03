import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, addItem, addTransfer } from "../src/model.js";
import { expensesCsv, transfersCsv } from "../src/csv.js";

const BOM = "﻿";

test("expensesCsv has BOM, header and a data row with category name", () => {
  const db = createDatabase();
  const c = db.categories[0];
  addItem(db, "2026-08", { name: "Tej", qty: 2, price: 640, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: c.id });
  const csv = expensesCsv(db, "2026-08");
  assert.ok(csv.startsWith(BOM));
  const lines = csv.slice(BOM.length).trim().split("\r\n");
  assert.equal(lines[0], "Hónap;Dátum;Kategória;Név;Db;Ár;Üzlet;Fizetés");
  assert.equal(lines[1], `2026-08;2026-08-03;${c.name};Tej;2;640;Lidl;Kártya`);
});

test("expensesCsv quotes fields containing the separator", () => {
  const db = createDatabase();
  const c = db.categories[0];
  addItem(db, "2026-08", { name: "Alma; körte", qty: 1, price: 300, store: "Piac", date: "2026-08-03", payment: "cash", categoryId: c.id });
  const csv = expensesCsv(db, "2026-08");
  assert.ok(csv.includes('"Alma; körte"'));
});

test("transfersCsv renders direction in Hungarian", () => {
  const db = createDatabase();
  addTransfer(db, "2026-08", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-08-01", partner: "Munka", note: "havi" });
  const csv = transfersCsv(db, "2026-08");
  const lines = csv.slice(BOM.length).trim().split("\r\n");
  assert.equal(lines[0], "Hónap;Dátum;Irány;Megnevezés;Összeg;Partner;Megjegyzés");
  assert.equal(lines[1], "2026-08;2026-08-01;Bejövő;Fizetés;400000;Munka;havi");
});
