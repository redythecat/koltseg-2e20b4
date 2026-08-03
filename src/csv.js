const BOM = "﻿";

function cell(v) {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function row(cells) {
  return cells.map(cell).join(";");
}
function monthKeys(db, monthKey) {
  return monthKey === null ? Object.keys(db.months).sort() : [monthKey];
}

export function expensesCsv(db, monthKey) {
  const catName = id => (db.categories.find(c => c.id === id) || {}).name || "";
  const pay = p => (p === "cash" ? "Készpénz" : "Kártya");
  const lines = ["Hónap;Dátum;Kategória;Név;Db;Ár;Üzlet;Fizetés"];
  for (const mk of monthKeys(db, monthKey)) {
    const m = db.months[mk];
    if (!m) continue;
    for (const it of m.items) {
      lines.push(row([mk, it.date, catName(it.categoryId), it.name, it.qty, Math.round(it.price), it.store, pay(it.payment)]));
    }
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

export function transfersCsv(db, monthKey) {
  const dir = d => (d === "in" ? "Bejövő" : "Kimenő");
  const lines = ["Hónap;Dátum;Irány;Megnevezés;Összeg;Partner;Megjegyzés"];
  for (const mk of monthKeys(db, monthKey)) {
    const m = db.months[mk];
    if (!m) continue;
    for (const t of m.transfers) {
      lines.push(row([mk, t.date, dir(t.dir), t.name, Math.round(t.amount), t.partner, t.note]));
    }
  }
  return BOM + lines.join("\r\n") + "\r\n";
}
