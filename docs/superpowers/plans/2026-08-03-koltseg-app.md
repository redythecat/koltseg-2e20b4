# Költség App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Egy telefonra telepíthető, offline költségkövető web-app (PWA), amiben a kiadások kategóriánként, az utalások (be/ki) külön, havonta vezethetők; blokkból Claude-import; export és backup; havi áttekintő.

**Architecture:** Statikus PWA, build-lépés nélkül (ES module-ok, vanilla JS). A teljes tiszta üzleti logika (adatmodell, összegzés, import-kód, CSV) DOM/böngésző nélküli modulokban él, `node --test`-tel tesztelve. A tárolás a böngésző `localStorage`-a egyetlen JSON-blobként; a modell-függvények tiszta állapot-objektumon dolgoznak. A UI vanilla DOM, kézzel ellenőrizve böngészőben (localhost). A blokk-import base64-elt JSON (beillesztés + URL-hash), amit Claude állít elő a Claude appban.

**Tech Stack:** HTML + CSS + vanilla JS (ES modules), PWA (manifest + service worker), Node beépített teszt-futtató (`node --test`), `python3 -m http.server` a helyi böngészős ellenőrzéshez. Külső futásidejű függőség nincs.

## Global Constraints

- **Nincs külső futásidejű függőség** — az appnak offline is mennie kell, CDN nélkül.
- **Nincs build-lépés** — a forrás közvetlenül fut (ES module `<script type="module">`).
- **Node ≥ 25** (tesztek); a helyi kiszolgálás `python3 -m http.server 8000`, az app `http://localhost:8000`-en nézhető (service worker localhoston engedélyezett).
- **Emoji-mentes UI** (globális szabály: kiszállított weboldal-tartalomban nincs emoji; helyette szöveg/egyszerű ikon).
- **Magyar felület, pénznem HUF**, egész forint (tizedes nélkül, `Math.round`).
- **Adat kizárólag a telón** (`localStorage`), egyetlen kulcs: `koltseg-db-v1`. Fiók/felhő nincs.
- **CSV Excel-HU-kompatibilis:** `;` elválasztó + UTF-8 BOM.
- **Blokk-import Claude appból**, base64 JSON kód; az import úgy épül, hogy később beépített scanner is hozzáköthető legyen (a UI egy `decodeImport`-ot hív — a forrás cserélhető).
- **A modell-függvények `id`-t bemenetként kapnak vagy `genId()`-vel generálnak**; a tesztek explicit `id`-kat adnak a determinizmusért.

## Adatmodell (kanonikus állapot-alak — minden task erre hivatkozik)

```js
// db:
{
  version: 1,
  categories: [ { id: "cat_x", name: "Élelmiszer", order: 0 } ],   // globális, sorrendezett
  reminders: [ { id, name, amount, note, active, freq, interval, startDate, until, notifyTime } ],
             // freq: "daily"|"weekly"|"monthly"; amount/until: lehet null; notifyTime: "HH:MM"
  settings: { theme: "system", notifications: false },  // theme: "system"|"dark"|"light"
  months: {
    "2026-08": {
      items:     [ { id, name, qty, price, store, date, payment, categoryId } ], // payment: "cash"|"card"
      transfers: [ { id, dir, name, amount, date, partner, note } ],             // dir: "in"|"out"
      paidReminders: [ "rem_id" ]   // ebben a hónapban kifizetettnek jelölt emlékeztetők
    }
  },
  templates: {
    items:     [ { name, store, categoryId, lastPrice, lastQty, payment } ],
    transfers: [ { dir, name, partner, lastAmount } ]
  }
}
```

## File Structure

```
koltseg-app/
├── index.html                # app shell; betölti a stílust és az app.js-t
├── styles.css                # mobil-first stílus
├── manifest.webmanifest      # PWA manifest
├── sw.js                     # service worker (offline cache)
├── icons/icon-192.png        # PWA ikon
├── icons/icon-512.png        # PWA ikon
├── src/
│   ├── model.js              # tiszta adatmodell: állapot, CRUD, összegzés, áttekintő, emlékeztetők (nincs böngésző-API)
│   ├── codec.js              # import-kód encode/decode + validáció (base64 JSON)
│   ├── csv.js                # CSV export string-építés
│   ├── ics.js                # .ics naptár-fájl generálás (RRULE/VALARM/UNTIL)
│   ├── storage.js            # localStorage load/save + backup export/import (böngésző)
│   ├── theme.js              # téma (sötét/világos/rendszer) alkalmazása
│   ├── ui.js                 # DOM render + eseménykezelés
│   └── app.js                # bekötés/indítás
└── test/
    ├── model.test.js
    ├── codec.test.js
    ├── csv.test.js
    ├── reminders.test.js
    └── ics.test.js
```

---

### Task 1: Projekt-váz + modell mag (createDatabase, ensureMonth, genId)

**Files:**
- Create: `src/model.js`
- Create: `test/model.test.js`
- Create: `package.json` (csak a teszt-szkripthez; nincs függőség)

**Interfaces:**
- Produces:
  - `DEFAULT_CATEGORIES: string[]`
  - `genId(prefix: string) => string`
  - `createDatabase() => db`  (db.categories a DEFAULT_CATEGORIES-ből, `id`/`order` kitöltve; db.months = {}, db.templates = {items:[],transfers:[]})
  - `ensureMonth(db, monthKey: string) => db`  (létrehozza a `{items:[],transfers:[]}` hónapot, ha hiányzik; a meglévőt nem bántja)

- [ ] **Step 1: package.json**

```json
{
  "name": "koltseg-app",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Failing test — `test/model.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, ensureMonth, DEFAULT_CATEGORIES, genId } from "../src/model.js";

test("createDatabase seeds default categories, reminders, settings and empty maps", () => {
  const db = createDatabase();
  assert.equal(db.version, 1);
  assert.equal(db.categories.length, DEFAULT_CATEGORIES.length);
  assert.deepEqual(db.categories.map(c => c.name), DEFAULT_CATEGORIES);
  assert.deepEqual(db.categories.map(c => c.order), DEFAULT_CATEGORIES.map((_, i) => i));
  assert.ok(db.categories.every(c => typeof c.id === "string" && c.id.length > 0));
  assert.deepEqual(db.months, {});
  assert.deepEqual(db.reminders, []);
  assert.deepEqual(db.settings, { theme: "system", notifications: false });
  assert.deepEqual(db.templates, { items: [], transfers: [] });
});

test("ensureMonth creates an empty month once and is idempotent", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  assert.deepEqual(db.months["2026-08"], { items: [], transfers: [], paidReminders: [] });
  db.months["2026-08"].items.push({ id: "x" });
  ensureMonth(db, "2026-08");
  assert.equal(db.months["2026-08"].items.length, 1); // nem törölte
});

test("genId returns unique prefixed ids", () => {
  const a = genId("cat");
  const b = genId("cat");
  assert.ok(a.startsWith("cat_"));
  assert.notEqual(a, b);
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `node --test`
Expected: FAIL — `src/model.js` nem létezik / export hiányzik.

- [ ] **Step 4: Implement — `src/model.js`**

```js
export const DEFAULT_CATEGORIES = [
  "Élelmiszer",
  "Alkohol/üdítő",
  "Tisztítószer",
  "Macska",
  "Luxus",
];

export function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createDatabase() {
  return {
    version: 1,
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: genId("cat"), name, order: i })),
    reminders: [],
    settings: { theme: "system", notifications: false },
    months: {},
    templates: { items: [], transfers: [] },
  };
}

export function ensureMonth(db, monthKey) {
  if (!db.months[monthKey]) db.months[monthKey] = { items: [], transfers: [], paidReminders: [] };
  else if (!db.months[monthKey].paidReminders) db.months[monthKey].paidReminders = [];
  return db;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `node --test`
Expected: PASS (mindhárom teszt).

- [ ] **Step 6: Commit**

```bash
git add package.json src/model.js test/model.test.js
git commit -m "feat: modell mag (createDatabase, ensureMonth, genId)"
```

---

### Task 2: Tétel-CRUD a modellben + sablon-frissítés

**Files:**
- Modify: `src/model.js`
- Modify: `test/model.test.js`

**Interfaces:**
- Consumes: `ensureMonth`, `genId` (Task 1).
- Produces:
  - `addItem(db, monthKey, item) => createdItem`  — `item`: `{name, qty, price, store, date, payment, categoryId}`; ha nincs `id`, generál; beszúrja a hónap `items`-ébe; frissíti a `templates.items` sablont (név+categoryId kulcson: `lastPrice`,`lastQty`,`store`,`payment`). Visszaadja a létrehozott tételt (van `id`).
  - `updateItem(db, monthKey, itemId, patch) => db`  — a megadott mezőket felülírja.
  - `moveItem(db, monthKey, itemId, newCategoryId) => db`
  - `deleteItem(db, monthKey, itemId) => db`

- [ ] **Step 1: Failing tests — bővítsd `test/model.test.js`-t**

```js
import { addItem, updateItem, moveItem, deleteItem } from "../src/model.js";

function baseDb() {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  return db;
}
const catId = (db) => db.categories[0].id;

test("addItem inserts item and returns it with an id", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Tej", qty: 2, price: 640, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: catId(db) });
  assert.ok(it.id);
  assert.equal(db.months["2026-08"].items.length, 1);
  assert.equal(db.months["2026-08"].items[0].name, "Tej");
});

test("addItem upserts a template keyed by name+categoryId", () => {
  const db = baseDb();
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  addItem(db, "2026-08", { name: "Tej", qty: 3, price: 900, store: "Aldi", date: "2026-08-04", payment: "card", categoryId: catId(db) });
  const tpls = db.templates.items.filter(t => t.name === "Tej");
  assert.equal(tpls.length, 1); // nem duplikál
  assert.equal(tpls[0].lastPrice, 900);
  assert.equal(tpls[0].lastQty, 3);
  assert.equal(tpls[0].store, "Aldi");
});

test("updateItem patches fields", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  updateItem(db, "2026-08", it.id, { price: 350, qty: 2 });
  const stored = db.months["2026-08"].items[0];
  assert.equal(stored.price, 350);
  assert.equal(stored.qty, 2);
});

test("moveItem changes categoryId", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Sör", qty: 1, price: 500, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: db.categories[0].id });
  moveItem(db, "2026-08", it.id, db.categories[1].id);
  assert.equal(db.months["2026-08"].items[0].categoryId, db.categories[1].id);
});

test("deleteItem removes the item", () => {
  const db = baseDb();
  const it = addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: catId(db) });
  deleteItem(db, "2026-08", it.id);
  assert.equal(db.months["2026-08"].items.length, 0);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test`
Expected: FAIL — az új exportok hiányoznak.

- [ ] **Step 3: Implement — bővítsd `src/model.js`-t**

```js
function upsertItemTemplate(db, item) {
  let t = db.templates.items.find(x => x.name === item.name && x.categoryId === item.categoryId);
  if (!t) {
    t = { name: item.name, store: item.store, categoryId: item.categoryId, lastPrice: item.price, lastQty: item.qty, payment: item.payment };
    db.templates.items.push(t);
  } else {
    t.store = item.store;
    t.lastPrice = item.price;
    t.lastQty = item.qty;
    t.payment = item.payment;
  }
}

export function addItem(db, monthKey, item) {
  ensureMonth(db, monthKey);
  const created = { id: item.id || genId("item"), ...item };
  db.months[monthKey].items.push(created);
  upsertItemTemplate(db, created);
  return created;
}

export function updateItem(db, monthKey, itemId, patch) {
  const it = db.months[monthKey].items.find(x => x.id === itemId);
  if (it) Object.assign(it, patch);
  return db;
}

export function moveItem(db, monthKey, itemId, newCategoryId) {
  return updateItem(db, monthKey, itemId, { categoryId: newCategoryId });
}

export function deleteItem(db, monthKey, itemId) {
  const m = db.months[monthKey];
  m.items = m.items.filter(x => x.id !== itemId);
  return db;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat: tétel-CRUD + sablon-frissítés a modellben"
```

---

### Task 3: Kategória-CRUD (add / rename / delete újrasorolással)

**Files:**
- Modify: `src/model.js`
- Modify: `test/model.test.js`

**Interfaces:**
- Consumes: `genId`, `addItem` (tesztekhez).
- Produces:
  - `addCategory(db, name) => createdCategory` (`order` a végére)
  - `renameCategory(db, categoryId, name) => db`
  - `deleteCategory(db, categoryId, reassignToId | null) => db` — ha `reassignToId` meg van adva, minden hónap összes ilyen tételét átsorolja rá; ha `null`, törli azokat a tételeket. A kategóriát kiveszi a listából.

- [ ] **Step 1: Failing tests**

```js
import { addCategory, renameCategory, deleteCategory } from "../src/model.js";

test("addCategory appends with next order", () => {
  const db = createDatabase();
  const c = addCategory(db, "Rezsi");
  assert.equal(c.name, "Rezsi");
  assert.equal(c.order, db.categories.length - 1);
});

test("renameCategory changes the name", () => {
  const db = createDatabase();
  const id = db.categories[0].id;
  renameCategory(db, id, "Kaja");
  assert.equal(db.categories.find(c => c.id === id).name, "Kaja");
});

test("deleteCategory with reassign moves items across all months", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  const from = db.categories[0].id;
  const to = db.categories[1].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: from });
  deleteCategory(db, from, to);
  assert.ok(!db.categories.find(c => c.id === from));
  assert.equal(db.months["2026-08"].items[0].categoryId, to);
});

test("deleteCategory without reassign deletes its items", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-08");
  const from = db.categories[0].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: from });
  deleteCategory(db, from, null);
  assert.ok(!db.categories.find(c => c.id === from));
  assert.equal(db.months["2026-08"].items.length, 0);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
export function addCategory(db, name) {
  const order = db.categories.length ? Math.max(...db.categories.map(c => c.order)) + 1 : 0;
  const c = { id: genId("cat"), name, order };
  db.categories.push(c);
  return c;
}

export function renameCategory(db, categoryId, name) {
  const c = db.categories.find(x => x.id === categoryId);
  if (c) c.name = name;
  return db;
}

export function deleteCategory(db, categoryId, reassignToId) {
  for (const key of Object.keys(db.months)) {
    const m = db.months[key];
    if (reassignToId) {
      for (const it of m.items) if (it.categoryId === categoryId) it.categoryId = reassignToId;
    } else {
      m.items = m.items.filter(it => it.categoryId !== categoryId);
    }
  }
  db.templates.items = db.templates.items.filter(t => t.categoryId !== categoryId);
  db.categories = db.categories.filter(c => c.id !== categoryId);
  return db;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat: kategória-CRUD újrasorolással"
```

---

### Task 4: Utalás-CRUD (bejövő / kimenő) + sablon

**Files:**
- Modify: `src/model.js`
- Modify: `test/model.test.js`

**Interfaces:**
- Consumes: `ensureMonth`, `genId`.
- Produces:
  - `addTransfer(db, monthKey, t) => createdTransfer` — `t`: `{dir, name, amount, date, partner, note}` (`dir`: `"in"|"out"`); frissít `templates.transfers` sablont (`dir`+`name` kulcson: `partner`,`lastAmount`).
  - `updateTransfer(db, monthKey, transferId, patch) => db`
  - `deleteTransfer(db, monthKey, transferId) => db`

- [ ] **Step 1: Failing tests**

```js
import { addTransfer, updateTransfer, deleteTransfer } from "../src/model.js";

test("addTransfer stores and upserts template", () => {
  const db = createDatabase();
  const t = addTransfer(db, "2026-08", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-08-01", partner: "Munkahely", note: "" });
  assert.ok(t.id);
  assert.equal(db.months["2026-08"].transfers.length, 1);
  const tpl = db.templates.transfers.find(x => x.dir === "in" && x.name === "Fizetés");
  assert.equal(tpl.lastAmount, 400000);
  assert.equal(tpl.partner, "Munkahely");
});

test("updateTransfer patches and deleteTransfer removes", () => {
  const db = createDatabase();
  const t = addTransfer(db, "2026-08", { dir: "out", name: "Albérlet", amount: 150000, date: "2026-08-05", partner: "Főbérlő", note: "" });
  updateTransfer(db, "2026-08", t.id, { amount: 160000 });
  assert.equal(db.months["2026-08"].transfers[0].amount, 160000);
  deleteTransfer(db, "2026-08", t.id);
  assert.equal(db.months["2026-08"].transfers.length, 0);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
function upsertTransferTemplate(db, t) {
  let tpl = db.templates.transfers.find(x => x.dir === t.dir && x.name === t.name);
  if (!tpl) db.templates.transfers.push({ dir: t.dir, name: t.name, partner: t.partner, lastAmount: t.amount });
  else { tpl.partner = t.partner; tpl.lastAmount = t.amount; }
}

export function addTransfer(db, monthKey, t) {
  ensureMonth(db, monthKey);
  const created = { id: t.id || genId("tr"), ...t };
  db.months[monthKey].transfers.push(created);
  upsertTransferTemplate(db, created);
  return created;
}

export function updateTransfer(db, monthKey, transferId, patch) {
  const t = db.months[monthKey].transfers.find(x => x.id === transferId);
  if (t) Object.assign(t, patch);
  return db;
}

export function deleteTransfer(db, monthKey, transferId) {
  const m = db.months[monthKey];
  m.transfers = m.transfers.filter(x => x.id !== transferId);
  return db;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat: utalás-CRUD (bejövő/kimenő) + sablon"
```

---

### Task 5: Összegzés + havi áttekintő számítás

**Files:**
- Modify: `src/model.js`
- Modify: `test/model.test.js`

**Interfaces:**
- Consumes: `addItem`, `addTransfer`.
- Produces:
  - `categoryTotal(db, monthKey, categoryId) => number` (a kategória tételeinek `price` összege)
  - `monthOverview(db, monthKey) => { income, expenseItems, expenseOut, totalExpense, balance, byCategory: [{categoryId, name, sum, share}], cash, card }`
    - `income` = bejövő utalások összege
    - `expenseItems` = összes tétel `price` összege
    - `expenseOut` = kimenő utalások összege
    - `totalExpense` = `expenseItems + expenseOut`
    - `balance` = `income - totalExpense`
    - `byCategory` a `db.categories` sorrendjében; `share` = `sum / expenseItems` (0, ha `expenseItems === 0`)
    - `cash`/`card` = tételek `price` összege fizetési mód szerint
    - minden szám egész (`Math.round`)

- [ ] **Step 1: Failing tests**

```js
import { categoryTotal, monthOverview } from "../src/model.js";

test("categoryTotal sums item prices in a category", () => {
  const db = createDatabase();
  const c = db.categories[0].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: c });
  addItem(db, "2026-08", { name: "Kenyér", qty: 1, price: 500, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: c });
  assert.equal(categoryTotal(db, "2026-08", c), 800);
});

test("monthOverview computes income, expense, balance, splits", () => {
  const db = createDatabase();
  const c0 = db.categories[0].id;
  const c1 = db.categories[1].id;
  addItem(db, "2026-08", { name: "Tej", qty: 1, price: 300, store: "Lidl", date: "2026-08-03", payment: "cash", categoryId: c0 });
  addItem(db, "2026-08", { name: "Sör", qty: 1, price: 700, store: "Lidl", date: "2026-08-03", payment: "card", categoryId: c1 });
  addTransfer(db, "2026-08", { dir: "in", name: "Fizetés", amount: 400000, date: "2026-08-01", partner: "", note: "" });
  addTransfer(db, "2026-08", { dir: "out", name: "Albérlet", amount: 150000, date: "2026-08-05", partner: "", note: "" });
  const o = monthOverview(db, "2026-08");
  assert.equal(o.income, 400000);
  assert.equal(o.expenseItems, 1000);
  assert.equal(o.expenseOut, 150000);
  assert.equal(o.totalExpense, 151000);
  assert.equal(o.balance, 249000);
  assert.equal(o.cash, 300);
  assert.equal(o.card, 700);
  const b0 = o.byCategory.find(x => x.categoryId === c0);
  assert.equal(b0.sum, 300);
  assert.ok(Math.abs(b0.share - 0.3) < 1e-9);
});

test("monthOverview on empty month is all zeros", () => {
  const db = createDatabase();
  ensureMonth(db, "2026-09");
  const o = monthOverview(db, "2026-09");
  assert.equal(o.income, 0);
  assert.equal(o.totalExpense, 0);
  assert.equal(o.balance, 0);
  assert.equal(o.byCategory.every(x => x.sum === 0 && x.share === 0), true);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
export function categoryTotal(db, monthKey, categoryId) {
  const m = db.months[monthKey];
  if (!m) return 0;
  return Math.round(m.items.filter(i => i.categoryId === categoryId).reduce((s, i) => s + i.price, 0));
}

export function monthOverview(db, monthKey) {
  const m = db.months[monthKey] || { items: [], transfers: [] };
  const income = Math.round(m.transfers.filter(t => t.dir === "in").reduce((s, t) => s + t.amount, 0));
  const expenseOut = Math.round(m.transfers.filter(t => t.dir === "out").reduce((s, t) => s + t.amount, 0));
  const expenseItems = Math.round(m.items.reduce((s, i) => s + i.price, 0));
  const cash = Math.round(m.items.filter(i => i.payment === "cash").reduce((s, i) => s + i.price, 0));
  const card = Math.round(m.items.filter(i => i.payment === "card").reduce((s, i) => s + i.price, 0));
  const byCategory = db.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(c => {
      const sum = categoryTotal(db, monthKey, c.id);
      return { categoryId: c.id, name: c.name, sum, share: expenseItems ? sum / expenseItems : 0 };
    });
  const totalExpense = expenseItems + expenseOut;
  return { income, expenseItems, expenseOut, totalExpense, balance: income - totalExpense, byCategory, cash, card };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat: összegzés + havi áttekintő számítás"
```

---

### Task 6: Import-kód (encode / decode / validáció)

**Files:**
- Create: `src/codec.js`
- Create: `test/codec.test.js`

**Interfaces:**
- Produces:
  - `encodeImport(payload) => string` — `payload`: `{ month: "YYYY-MM", items: [{name, qty, price, store, date, payment, category}] }` (`category` = kategória **neve** szövegként). UTF-8-biztos base64.
  - `decodeImport(code) => payload` — visszafejt + validál; hibás bemenetre `Error`-t dob. Ellenőrzi: objektum, `month` string, `items` tömb, minden tételnek van `name` (string) és `price` (véges szám); a hiányzó `qty` → 1, `payment` → `"card"`, a többi mező üres string alap.

- [ ] **Step 1: Failing test — `test/codec.test.js`**

```js
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/codec.test.js`
Expected: FAIL — `src/codec.js` hiányzik.

- [ ] **Step 3: Implement — `src/codec.js`**

```js
// UTF-8-biztos base64 (böngésző + Node globális btoa/atob-bal)
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeImport(payload) {
  return toB64(JSON.stringify(payload));
}

export function decodeImport(code) {
  let obj;
  try {
    obj = JSON.parse(fromB64(String(code).trim()));
  } catch {
    throw new Error("Érvénytelen import-kód (nem visszafejthető).");
  }
  if (!obj || typeof obj !== "object" || typeof obj.month !== "string" || !Array.isArray(obj.items)) {
    throw new Error("Érvénytelen import-kód (hiányzó month vagy items).");
  }
  const items = obj.items.map((raw, i) => {
    if (!raw || typeof raw.name !== "string" || raw.name === "") throw new Error(`A(z) ${i + 1}. tételnek nincs neve.`);
    if (typeof raw.price !== "number" || !Number.isFinite(raw.price)) throw new Error(`A(z) ${i + 1}. tétel price mezője hibás.`);
    return {
      name: raw.name,
      qty: Number.isFinite(raw.qty) ? raw.qty : 1,
      price: raw.price,
      store: typeof raw.store === "string" ? raw.store : "",
      date: typeof raw.date === "string" ? raw.date : "",
      payment: raw.payment === "cash" ? "cash" : "card",
      category: typeof raw.category === "string" ? raw.category : "",
    };
  });
  return { month: obj.month, items };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test test/codec.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/codec.js test/codec.test.js
git commit -m "feat: import-kód encode/decode + validáció"
```

---

### Task 7: CSV export

**Files:**
- Create: `src/csv.js`
- Create: `test/csv.test.js`

**Interfaces:**
- Consumes: `createDatabase`, `ensureMonth`, `addItem`, `addTransfer`, categories.
- Produces:
  - `expensesCsv(db, monthKey | null) => string` — fejléc: `Hónap;Dátum;Kategória;Név;Db;Ár;Üzlet;Fizetés`. `monthKey===null` → minden hónap. Kategórianév a `categoryId`-ból; `payment` → `Készpénz`/`Kártya`. UTF-8 BOM elöl, `;` elválasztó, CRLF sorvég, mezők idézőjelezve, ha `;`/`"`/sortörés van bennük.
  - `transfersCsv(db, monthKey | null) => string` — fejléc: `Hónap;Dátum;Irány;Megnevezés;Összeg;Partner;Megjegyzés`. `dir` → `Bejövő`/`Kimenő`.

- [ ] **Step 1: Failing test — `test/csv.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, ensureMonth, addItem, addTransfer } from "../src/model.js";
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/csv.test.js`
Expected: FAIL — `src/csv.js` hiányzik.

- [ ] **Step 3: Implement — `src/csv.js`**

```js
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test test/csv.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/csv.js test/csv.test.js
git commit -m "feat: CSV export (kiadások + utalások)"
```

---

### Task 8: Tárolás-réteg (localStorage + backup)

**Files:**
- Create: `src/storage.js`

**Interfaces:**
- Consumes: `createDatabase` (Task 1).
- Produces:
  - `KEY = "koltseg-db-v1"`
  - `load() => db` (localStorage-ból; ha nincs/hibás → `createDatabase()`)
  - `save(db) => void`
  - `downloadBackup(db) => void` (JSON fájl letöltése)
  - `readBackupFile(file) => Promise<db>` (fájlból beolvas + minimálisan validál: `version` és `categories` legyen)

**Megjegyzés a teszteléshez:** ez böngésző-API-kat használ (`localStorage`, `Blob`, `FileReader`), ezért nincs `node --test`; a **Step 3 kézi ellenőrzés** böngészőben. A validációs logika triviális, a UI-taskok gyakorolják be.

- [ ] **Step 1: Implement — `src/storage.js`**

```js
import { createDatabase } from "./model.js";

export const KEY = "koltseg-db-v1";

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createDatabase();
    const db = JSON.parse(raw);
    if (!db || db.version !== 1 || !Array.isArray(db.categories)) return createDatabase();
    return db;
  } catch {
    return createDatabase();
  }
}

export function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function downloadBackup(db) {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `koltseg-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const db = JSON.parse(fr.result);
        if (!db || db.version !== 1 || !Array.isArray(db.categories)) throw new Error("bad");
        resolve(db);
      } catch {
        reject(new Error("Érvénytelen backup fájl."));
      }
    };
    fr.onerror = () => reject(new Error("Nem sikerült beolvasni a fájlt."));
    fr.readAsText(file);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/storage.js
git commit -m "feat: localStorage tárolás + backup export/import"
```

- [ ] **Step 3: Kézi ellenőrzés (Task 9 után, amikor van betöltő UI)** — a böngésző DevTools konzolján `localStorage.getItem('koltseg-db-v1')` mutat mentett adatot az első tétel felvétele után. (Itt még csak jegyezd fel; a tényleges ellenőrzés a Task 9-ben történik.)

---

### Task 9: App-váz (HTML/CSS) + hónap-nézet renderelése

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/ui.js`
- Create: `src/app.js`

**Interfaces:**
- Consumes: `load`, `save` (Task 8); `createDatabase`, `monthOverview`, `categoryTotal`, categories/items (Task 1–5).
- Produces (a további UI-taskok ezekre építenek):
  - `src/app.js` globális állapot: `state = { db, month }`, ahol `month` az aktuális `"YYYY-MM"`.
  - `render()` — kirajzolja az aktuális nézetet a `#app` elembe a `state` alapján.
  - `commit()` — `save(state.db)` majd `render()`.
  - `src/ui.js` exportál render-részfüggvényeket: `renderMonthView(state, handlers) => HTMLElement`. A `handlers` objektum a Task 10–15-ben bővül; Task 9-ben elég: `onPrevMonth`, `onNextMonth`.

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#1f2933" />
  <link rel="manifest" href="manifest.webmanifest" />
  <link rel="stylesheet" href="styles.css" />
  <title>Költség</title>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `styles.css`** (mobil-first, letisztult, nagy célfelületek, emoji nélkül)

```css
:root {
  --bg: #10161c; --card: #1b242d; --line: #2b3742; --fg: #eef2f5; --muted: #9fb0bd;
  --accent: #4c9aff; --pos: #34c77b; --neg: #ff6b6b; --radius: 14px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); }
#app { max-width: 640px; margin: 0 auto; padding: 12px 12px 96px; }
h1, h2, h3 { margin: 0 0 8px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.month-nav { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; }
button { font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 12px 14px; min-height: 48px; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #06121f; font-weight: 600; }
button.ghost { background: transparent; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 12px; margin-bottom: 10px; }
.cat-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.cat-sum { color: var(--muted); }
.item { display: flex; justify-content: space-between; gap: 8px; padding: 10px 0; border-top: 1px solid var(--line); }
.item small { color: var(--muted); }
.total { font-size: 20px; font-weight: 700; text-align: right; margin-top: 8px; }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 6px; padding: 8px;
  background: #0b1116; border-top: 1px solid var(--line); max-width: 640px; margin: 0 auto; }
.tabbar button { flex: 1; min-height: 52px; }
input, select { font: inherit; color: var(--fg); background: #0e151b; border: 1px solid var(--line);
  border-radius: 10px; padding: 12px; width: 100%; min-height: 48px; }
label { display: block; color: var(--muted); font-size: 13px; margin: 8px 0 4px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bar { height: 8px; background: #0e151b; border-radius: 6px; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); }
dialog { background: var(--card); color: var(--fg); border: 1px solid var(--line);
  border-radius: var(--radius); max-width: 560px; width: calc(100% - 24px); }
.muted { color: var(--muted); }
.pos { color: var(--pos); } .neg { color: var(--neg); }
```

- [ ] **Step 3: `src/ui.js` — hónap-nézet**

```js
export function ft(n) { return new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft"; }

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const names = ["január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"];
  return `${y} ${names[m - 1]}`;
}
export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) n.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ""));
  return n;
}

import { monthOverview, categoryTotal } from "./model.js";

export function renderMonthView(state, h) {
  const { db, month } = state;
  const wrap = el("div");
  wrap.append(el("div", { class: "topbar" },
    el("div", { class: "month-nav" },
      el("button", { class: "ghost", "aria-label": "Előző hónap", onclick: h.onPrevMonth }, "‹"),
      el("span", {}, monthLabel(month)),
      el("button", { class: "ghost", "aria-label": "Következő hónap", onclick: h.onNextMonth }, "›"),
    ),
    el("button", { class: "primary", onclick: h.onAddItem }, "Új tétel"),
  ));

  const m = db.months[month] || { items: [], transfers: [] };
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    const items = m.items.filter(i => i.categoryId === c.id);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" },
      el("span", {}, c.name),
      el("span", { class: "cat-sum" }, ft(categoryTotal(db, month, c.id))),
    ));
    for (const it of items) {
      card.append(el("div", { class: "item", onclick: () => h.onEditItem(it.id) },
        el("div", {}, el("div", {}, it.name),
          el("small", {}, `${it.qty} db · ${it.store || "—"} · ${it.payment === "cash" ? "kp" : "kártya"}`)),
        el("div", {}, ft(it.price)),
      ));
    }
    if (!items.length) card.append(el("div", { class: "item muted" }, "Nincs tétel"));
    wrap.append(card);
  }
  const o = monthOverview(db, month);
  wrap.append(el("div", { class: "total" }, `Havi kiadás: ${ft(o.totalExpense)}`));
  return wrap;
}
```

- [ ] **Step 4: `src/app.js` — bekötés + alsó menü**

```js
import { load, save } from "./storage.js";
import { el, renderMonthView, shiftMonth } from "./ui.js";

const state = { db: load(), month: currentMonthKey(), view: "month" };

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function commit() { save(state.db); render(); }

const handlers = {
  onPrevMonth: () => { state.month = shiftMonth(state.month, -1); render(); },
  onNextMonth: () => { state.month = shiftMonth(state.month, 1); render(); },
  onAddItem: () => alert("Tétel-felvétel a Task 10-ben."),
  onEditItem: () => alert("Tétel-szerkesztés a Task 10-ben."),
};

function tabbar() {
  const mk = (label, view) => el("button", { class: state.view === view ? "primary" : "", onclick: () => { state.view = view; render(); } }, label);
  return el("div", { class: "tabbar" }, mk("Hónap", "month"), mk("Utalások", "transfers"), mk("Áttekintő", "overview"), mk("Beállítások", "settings"));
}

function render() {
  const root = document.getElementById("app");
  root.replaceChildren();
  if (state.view === "month") root.append(renderMonthView(state, handlers));
  else root.append(el("div", { class: "card" }, "Ez a nézet a következő taskban készül."));
  document.body.append(tabbar());
  // egyetlen tabbar
  const bars = document.querySelectorAll(".tabbar");
  bars.forEach((b, i) => { if (i < bars.length - 1) b.remove(); });
}
render();
```

- [ ] **Step 5: Kézi ellenőrzés böngészőben**

Run: `python3 -m http.server 8000` a projekt gyökerében, majd nyisd meg `http://localhost:8000`.
Expected:
- Megjelenik az 5 kategória-kártya, mindegyik „Nincs tétel", a hónap az aktuális.
- A `‹`/`›` gombok váltják a hónap feliratát.
- Az alsó menüben 4 fül; a „Hónap" aktív. A többi fül placeholder-kártyát mutat.
- Konzolban nincs hiba.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/ui.js src/app.js
git commit -m "feat: app-váz + hónap-nézet renderelése"
```

---

### Task 10: Tétel felvétele/szerkesztése (űrlap + gyorslista)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `addItem`, `updateItem`, `moveItem`, `deleteItem`, `genId`, categories, `db.templates.items` (Task 2).
- Produces:
  - `renderItemForm(state, { item, onSave, onDelete, onCancel }) => HTMLElement` — `item` `null` (új) vagy meglévő tétel. Mezők: név, darabszám, ár, üzlet, dátum (alap: ma), fizetési mód (Készpénz/Kártya select), kategória (select). Új tételnél „Gyorslista" szekció a `templates.items`-ből: gombra kattintva kitölti a mezőket a sablonból.
  - `app.js` handler-ek: `onAddItem` → űrlap üresen; `onEditItem(id)` → űrlap az adott tétellel, Mentés/Törlés-sel. Mentés → `addItem`/`updateItem` (+ `moveItem`, ha változott a kategória) → `commit()`.

- [ ] **Step 1: `renderItemForm` — `src/ui.js`**

```js
export function todayKey() { return new Date().toISOString().slice(0, 10); }

export function renderItemForm(state, { item, onSave, onDelete, onCancel }) {
  const { db } = state;
  const v = item || { name: "", qty: 1, price: "", store: "", date: todayKey(), payment: "card", categoryId: db.categories[0]?.id };
  const f = { ...v };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, item ? "Tétel szerkesztése" : "Új tétel"));

  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Név" });
  const inQty = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.qty, oninput: e => f.qty = Number(e.target.value) });
  const inPrice = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.price, oninput: e => f.price = Number(e.target.value), placeholder: "Ár (Ft)" });
  const inStore = el("input", { value: f.store, oninput: e => f.store = e.target.value, placeholder: "Üzlet" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
  const selPay = el("select", { onchange: e => f.payment = e.target.value },
    el("option", { value: "card", ...(f.payment === "card" ? { selected: "" } : {}) }, "Kártya"),
    el("option", { value: "cash", ...(f.payment === "cash" ? { selected: "" } : {}) }, "Készpénz"));
  const selCat = el("select", { onchange: e => f.categoryId = e.target.value },
    ...db.categories.map(c => el("option", { value: c.id, ...(c.id === f.categoryId ? { selected: "" } : {}) }, c.name)));

  if (!item && db.templates.items.length) {
    const quick = el("div", {});
    quick.append(el("label", {}, "Gyorslista"));
    for (const t of db.templates.items) {
      quick.append(el("button", { class: "ghost", onclick: () => {
        inName.value = f.name = t.name;
        inStore.value = f.store = t.store || "";
        inQty.value = f.qty = t.lastQty ?? 1;
        inPrice.value = f.price = t.lastPrice ?? "";
        selPay.value = f.payment = t.payment || "card";
        if (db.categories.find(c => c.id === t.categoryId)) { selCat.value = f.categoryId = t.categoryId; }
      } }, `+ ${t.name}`));
    }
    wrap.append(quick);
  }

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Darab"), inQty), el("div", {}, el("label", {}, "Ár (Ft)"), inPrice)));
  wrap.append(el("label", {}, "Üzlet"), inStore);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Dátum"), inDate), el("div", {}, el("label", {}, "Fizetés"), selPay)));
  wrap.append(el("label", {}, "Kategória"), selCat);

  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => {
    if (!f.name || !(f.price >= 0)) { alert("Név és ár kötelező."); return; }
    onSave(f);
  } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (item && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(item.id) }, "Törlés"));
  return wrap;
}
```

- [ ] **Step 2: `app.js` — kösd be a form nézetet**

```js
// import bővítés:
import { addItem, updateItem, moveItem, deleteItem } from "./model.js";
import { renderItemForm } from "./ui.js";

// state.editing = { type: "item", id? } | null
handlers.onAddItem = () => { state.editing = { type: "item", id: null }; render(); };
handlers.onEditItem = (id) => { state.editing = { type: "item", id }; render(); };

function saveItem(f) {
  const cur = state.editing.id;
  if (cur == null) {
    addItem(state.db, state.month, f);
  } else {
    updateItem(state.db, state.month, cur, { name: f.name, qty: f.qty, price: f.price, store: f.store, date: f.date, payment: f.payment });
    moveItem(state.db, state.month, cur, f.categoryId);
  }
  state.editing = null; commit();
}
function removeItem(id) { deleteItem(state.db, state.month, id); state.editing = null; commit(); }

// a render()-ben, a nézetválasztás elé:
//   if (state.editing?.type === "item") { root.append(renderItemForm(state, {
//     item: state.editing.id ? state.db.months[state.month].items.find(i => i.id === state.editing.id) : null,
//     onSave: saveItem, onDelete: removeItem, onCancel: () => { state.editing = null; render(); } })); return finishTabbar(); }
```

*(Refaktor: told ki a tabbar-hozzáfűzést egy `finishTabbar()` segédbe, hogy a korai `return`-ök is megtegyék. A `render()` végén `return finishTabbar();`.)*

- [ ] **Step 3: Kézi ellenőrzés**

Run: `python3 -m http.server 8000`, `http://localhost:8000`.
Expected:
- „Új tétel" → űrlap; kitöltve + Mentés → a tétel megjelenik a megfelelő kategóriában, a kategória- és havi összeg nő.
- Újabb „Új tétel"-nél a „Gyorslista" alatt megjelenik a korábbi név; rákattintva kitölti a mezőket.
- Meglévő tételre kattintva szerkeszthető, kategória átállítható (átkerül), törölhető.
- Frissítés (F5) után az adat megmarad (localStorage).

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: tétel felvétel/szerkesztés + gyorslista"
```

---

### Task 11: Kategóriák kezelése (UI)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `addCategory`, `renameCategory`, `deleteCategory` (Task 3).
- Produces:
  - `renderCategoryManager(state, { onAdd, onRename, onDelete, onBack }) => HTMLElement` — lista a kategóriákról átnevező mezővel; „Új kategória" input+gomb; törlésnél megkérdi, hova soroljon át (select a többi kategóriából) vagy törölje a tételeket.
  - `app.js`: a „Több" fül alatti menüből érhető el (Task 15 köti be véglegesen; itt ideiglenes gomb is elég a „Több" nézetben).

- [ ] **Step 1: `renderCategoryManager` — `src/ui.js`**

```js
export function renderCategoryManager(state, { onAdd, onRename, onDelete, onBack }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Kategóriák"), el("button", { class: "ghost", onclick: onBack }, "Kész")));
  for (const c of db.categories.slice().sort((a, b) => a.order - b.order)) {
    const card = el("div", { class: "card" });
    const input = el("input", { value: c.name });
    card.append(el("label", {}, "Név"), input);
    const actions = el("div", { class: "row", style: "margin-top:8px" });
    actions.append(el("button", { class: "primary", onclick: () => onRename(c.id, input.value.trim()) }, "Átnevez"));
    actions.append(el("button", { class: "ghost", style: "color:var(--neg)", onclick: () => onDelete(c) }, "Törlés"));
    card.append(actions);
    wrap.append(card);
  }
  const nc = el("input", { placeholder: "Új kategória neve" });
  wrap.append(el("div", { class: "card" }, el("label", {}, "Új kategória"), nc,
    el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => { if (nc.value.trim()) { onAdd(nc.value.trim()); } } }, "Hozzáadás")));
  return wrap;
}
```

- [ ] **Step 2: `app.js` handler-ek**

```js
import { addCategory, renameCategory, deleteCategory } from "./model.js";
import { renderCategoryManager } from "./ui.js";

handlers.onManageCategories = () => { state.view = "categories"; render(); };
function onDeleteCategory(c) {
  if (state.db.categories.length <= 1) { alert("Legalább egy kategória kell."); return; }
  const others = state.db.categories.filter(x => x.id !== c.id);
  const list = others.map((x, i) => `${i + 1}. ${x.name}`).join("\n");
  const ans = prompt(`"${c.name}" törlése. Hova soroljam át a tételeit?\n${list}\n\nAdj meg egy sorszámot, vagy írd: torol`, "1");
  if (ans === null) return;
  if (ans.trim().toLowerCase() === "torol") deleteCategory(state.db, c.id, null);
  else {
    const idx = Number(ans) - 1;
    if (!others[idx]) { alert("Érvénytelen választás."); return; }
    deleteCategory(state.db, c.id, others[idx].id);
  }
  commit();
}
// render(): if (state.view === "categories") { root.append(renderCategoryManager(state, {
//   onAdd: (n) => { addCategory(state.db, n); commit(); },
//   onRename: (id, n) => { if (n) { renameCategory(state.db, id, n); commit(); } },
//   onDelete: onDeleteCategory, onBack: () => { state.view = "month"; render(); } })); return finishTabbar(); }
```

- [ ] **Step 3: Kézi ellenőrzés**

Expected: kategória átnevezése frissül a hónap-nézetben; új kategória megjelenik; törlésnél a `prompt` szerint átsorol vagy törli a tételeket; utolsó kategória nem törölhető.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: kategória-kezelő UI"
```

---

### Task 12: Utalások nézet (UI)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `addTransfer`, `updateTransfer`, `deleteTransfer`, `db.templates.transfers` (Task 4).
- Produces:
  - `renderTransfersView(state, h) => HTMLElement` — két szekció (Bejövő / Kimenő) a hónap utalásaival, összegekkel; „Új bejövő" / „Új kimenő" gombok.
  - `renderTransferForm(state, { transfer, dir, onSave, onDelete, onCancel }) => HTMLElement` — mezők: megnevezés, összeg, dátum, partner, megjegyzés; új tételnél gyorslista a `templates.transfers`-ből (adott `dir`-re).
  - `app.js` handler-ek + `state.view === "transfers"` renderelése és a form.

- [ ] **Step 1: `src/ui.js` — nézet + form**

```js
export function renderTransfersView(state, h) {
  const { db, month } = state;
  const m = db.months[month] || { items: [], transfers: [] };
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Utalások"), el("span", { class: "muted" }, monthLabel(month))));
  for (const [dir, title] of [["in", "Bejövő"], ["out", "Kimenő"]]) {
    const list = m.transfers.filter(t => t.dir === dir);
    const sum = list.reduce((s, t) => s + t.amount, 0);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" }, el("span", {}, title), el("span", { class: "cat-sum" }, ft(sum))));
    for (const t of list) {
      card.append(el("div", { class: "item", onclick: () => h.onEditTransfer(t.id) },
        el("div", {}, el("div", {}, t.name), el("small", {}, `${t.date || "—"} · ${t.partner || "—"}`)),
        el("div", { class: dir === "in" ? "pos" : "neg" }, (dir === "in" ? "+" : "−") + ft(t.amount))));
    }
    card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => h.onAddTransfer(dir) }, `Új ${title.toLowerCase()}`));
    wrap.append(card);
  }
  return wrap;
}

export function renderTransferForm(state, { transfer, dir, onSave, onDelete, onCancel }) {
  const v = transfer || { dir, name: "", amount: "", date: todayKey(), partner: "", note: "" };
  const f = { ...v };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, transfer ? "Utalás szerkesztése" : (f.dir === "in" ? "Új bejövő" : "Új kimenő")));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Megnevezés" });
  const inAmt = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount, oninput: e => f.amount = Number(e.target.value), placeholder: "Összeg (Ft)" });
  const inDate = el("input", { type: "date", value: f.date, oninput: e => f.date = e.target.value });
  const inPartner = el("input", { value: f.partner, oninput: e => f.partner = e.target.value, placeholder: f.dir === "in" ? "Kitől" : "Kinek" });
  const inNote = el("input", { value: f.note, oninput: e => f.note = e.target.value, placeholder: "Megjegyzés" });

  if (!transfer) {
    const tpls = state.db.templates.transfers.filter(t => t.dir === f.dir);
    if (tpls.length) {
      const q = el("div", {}); q.append(el("label", {}, "Gyorslista"));
      for (const t of tpls) q.append(el("button", { class: "ghost", onclick: () => {
        inName.value = f.name = t.name; inPartner.value = f.partner = t.partner || ""; inAmt.value = f.amount = t.lastAmount ?? "";
      } }, `+ ${t.name}`));
      wrap.append(q);
    }
  }
  wrap.append(el("label", {}, "Megnevezés"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (Ft)"), inAmt), el("div", {}, el("label", {}, "Dátum"), inDate)));
  wrap.append(el("label", {}, f.dir === "in" ? "Kitől" : "Kinek"), inPartner);
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name || !(f.amount >= 0)) { alert("Megnevezés és összeg kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (transfer && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(transfer.id) }, "Törlés"));
  return wrap;
}
```

- [ ] **Step 2: `app.js` handler-ek + render-ág**

```js
import { addTransfer, updateTransfer, deleteTransfer } from "./model.js";
import { renderTransfersView, renderTransferForm } from "./ui.js";

handlers.onAddTransfer = (dir) => { state.editing = { type: "transfer", id: null, dir }; render(); };
handlers.onEditTransfer = (id) => { state.editing = { type: "transfer", id }; render(); };
function saveTransfer(f) {
  const cur = state.editing.id;
  if (cur == null) addTransfer(state.db, state.month, f);
  else updateTransfer(state.db, state.month, cur, { name: f.name, amount: f.amount, date: f.date, partner: f.partner, note: f.note });
  state.editing = null; commit();
}
function removeTransfer(id) { deleteTransfer(state.db, state.month, id); state.editing = null; commit(); }
// render() elején az item-form ág mellé:
//   if (state.editing?.type === "transfer") { const tr = state.editing.id ? state.db.months[state.month].transfers.find(t => t.id === state.editing.id) : null;
//     root.append(renderTransferForm(state, { transfer: tr, dir: state.editing.dir, onSave: saveTransfer, onDelete: removeTransfer, onCancel: () => { state.editing = null; render(); } })); return finishTabbar(); }
//   if (state.view === "transfers") { root.append(renderTransfersView(state, handlers)); return finishTabbar(); }
```

- [ ] **Step 3: Kézi ellenőrzés**

Expected: „Utalások" fülön két szekció; „Új bejövő"/„Új kimenő" felvétele megjelenik és összegződik; szerkeszthető/törölhető; gyorslista a második azonos irányú utalásnál kitölt; F5 után megmarad.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: utalások nézet + űrlap"
```

---

### Task 13: Áttekintő / kimutató nézet (UI)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `monthOverview` (Task 5).
- Produces: `renderOverview(state) => HTMLElement` — bevétel, kiadás, egyenleg (egyenleg színe pos/neg); kategória-bontás sávokkal (`share`); kp/kártya bontás.

- [ ] **Step 1: `renderOverview` — `src/ui.js`**

```js
export function renderOverview(state) {
  const o = monthOverview(state.db, state.month);
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Áttekintő"), el("span", { class: "muted" }, monthLabel(state.month))));
  const kpi = el("div", { class: "card" });
  kpi.append(el("div", { class: "cat-head" }, el("span", {}, "Bevétel"), el("span", { class: "pos" }, ft(o.income))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kiadás"), el("span", { class: "neg" }, ft(o.totalExpense))));
  kpi.append(el("div", { class: "cat-head", style: "margin-top:6px;font-weight:700" }, el("span", {}, "Egyenleg"), el("span", { class: o.balance >= 0 ? "pos" : "neg" }, ft(o.balance))));
  wrap.append(kpi);

  const cats = el("div", { class: "card" });
  cats.append(el("h3", {}, "Kiadások kategóriánként"));
  for (const b of o.byCategory) {
    cats.append(el("div", { class: "cat-head", style: "margin-top:8px" }, el("span", {}, b.name), el("span", { class: "muted" }, `${ft(b.sum)} · ${Math.round(b.share * 100)}%`)));
    cats.append(el("div", { class: "bar" }, el("span", { style: `width:${Math.round(b.share * 100)}%` })));
  }
  wrap.append(cats);

  const pay = el("div", { class: "card" });
  pay.append(el("h3", {}, "Bolti fizetés módja"));
  pay.append(el("div", { class: "cat-head" }, el("span", {}, "Készpénz"), el("span", { class: "muted" }, ft(o.cash))));
  pay.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kártya"), el("span", { class: "muted" }, ft(o.card))));
  pay.append(el("div", { class: "cat-head", style: "margin-top:6px" }, el("span", {}, "Kimenő utalás"), el("span", { class: "muted" }, ft(o.expenseOut))));
  wrap.append(pay);
  return wrap;
}
```

- [ ] **Step 2: `app.js`**

```js
import { renderOverview } from "./ui.js";
// render(): if (state.view === "overview") { root.append(renderOverview(state)); return finishTabbar(); }
```

- [ ] **Step 3: Kézi ellenőrzés**

Expected: „Áttekintő" fülön a Task 10/12 adataival a bevétel/kiadás/egyenleg helyes; a kategória-sávok aránya stimmel; egyenleg negatívnál piros.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: áttekintő/kimutató nézet"
```

---

### Task 14: Blokk-import (beillesztés + URL-hash + előnézet)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `decodeImport` (Task 6); `addItem`, `addCategory`, categories (Task 2–3).
- Produces:
  - `renderImportView(state, { onDecode, onConfirm, onBack }) => HTMLElement` — textarea a kódnak + „Beolvasás" gomb; a dekódolt tételek előnézete, mindegyiknél kategória-select (a `category` névből előre kiválasztva, ha van egyező; különben első kategória); „Hozzáadás a hónaphoz" gomb.
  - `app.js`: `state.view === "import"` renderelése; a betöltéskor `location.hash` `#import=CODE` esetén automatikus dekódolás és import-nézetre váltás (a hash-t törli). A célt: a hónap az importban megadott `month` (ha üres, a jelenlegi).
  - `findCategoryIdByName(db, name) => string | null`.

- [ ] **Step 1: `src/ui.js` — import nézet**

```js
export function findCategoryIdByName(db, name) {
  const c = db.categories.find(x => x.name.toLowerCase() === String(name || "").toLowerCase());
  return c ? c.id : null;
}

export function renderImportView(state, { onDecode, onConfirm, onBack, initialCode }) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Blokk import"), el("button", { class: "ghost", onclick: onBack }, "Vissza")));
  const ta = el("textarea", { rows: "4", placeholder: "Illeszd be ide a Claude-tól kapott import-kódot", style: "width:100%" }, initialCode || "");
  wrap.append(el("div", { class: "card" }, ta, el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: () => onDecode(ta.value) }, "Beolvasás")));

  if (state.importPreview) {
    const p = state.importPreview; // { month, rows: [{name, qty, price, store, date, payment, categoryId}] }
    const box = el("div", { class: "card" });
    box.append(el("h3", {}, `${p.rows.length} tétel — ${monthLabel(p.month)}`));
    p.rows.forEach((r, idx) => {
      const sel = el("select", { onchange: e => r.categoryId = e.target.value }, ...db.categories.map(c => el("option", { value: c.id, ...(c.id === r.categoryId ? { selected: "" } : {}) }, c.name)));
      box.append(el("div", { class: "item" },
        el("div", {}, el("div", {}, `${r.name} — ${ft(r.price)}`), el("small", {}, `${r.qty} db · ${r.store || "—"} · ${r.payment === "cash" ? "kp" : "kártya"}`)),
        sel));
    });
    box.append(el("button", { class: "primary", style: "margin-top:8px;width:100%", onclick: onConfirm }, "Hozzáadás a hónaphoz"));
    wrap.append(box);
  }
  return wrap;
}
```

- [ ] **Step 2: `app.js` — dekódolás, hash, megerősítés**

```js
import { decodeImport } from "./codec.js";
import { renderImportView, findCategoryIdByName } from "./ui.js";
import { addItem } from "./model.js";

handlers.onOpenImport = (code) => { state.view = "import"; state.importCode = code || ""; state.importPreview = null; render(); };

function decodeToPreview(code) {
  let payload;
  try { payload = decodeImport(code); } catch (e) { alert(e.message); return; }
  const month = payload.month || state.month;
  const rows = payload.items.map(it => ({
    name: it.name, qty: it.qty, price: it.price, store: it.store, date: it.date || month + "-01", payment: it.payment,
    categoryId: findCategoryIdByName(state.db, it.category) || state.db.categories[0].id,
  }));
  state.importPreview = { month, rows };
  render();
}
function confirmImport() {
  const { month, rows } = state.importPreview;
  for (const r of rows) addItem(state.db, month, { name: r.name, qty: r.qty, price: r.price, store: r.store, date: r.date, payment: r.payment, categoryId: r.categoryId });
  state.importPreview = null; state.view = "month"; state.month = month; commit();
  alert(`${rows.length} tétel hozzáadva.`);
}
// render(): if (state.view === "import") { root.append(renderImportView(state, {
//   initialCode: state.importCode, onDecode: decodeToPreview, onConfirm: confirmImport, onBack: () => { state.view = "month"; render(); } })); return finishTabbar(); }

// Induláskor, a render() ELŐTT:
(function handleHashImport() {
  const m = location.hash.match(/^#import=(.+)$/);
  if (m) {
    const code = decodeURIComponent(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
    handlers.onOpenImport(code);
    decodeToPreview(code);
  }
})();
```

- [ ] **Step 3: Kézi ellenőrzés**

Készíts egy teszt-kódot node-dal:
Run: `node -e "import('./src/codec.js').then(({encodeImport})=>console.log(encodeImport({month:'2026-08',items:[{name:'Tejföl',qty:2,price:780,store:'Lidl',date:'2026-08-03',payment:'card',category:'Élelmiszer'},{name:'Sör',qty:6,price:1800,store:'Lidl',date:'2026-08-03',payment:'card',category:'Alkohol/üdítő'}]})))"`
- Másold a kimeneti kódot; az appban „Több" → import (vagy közvetlen nézet), illeszd be, „Beolvasás" → 2 soros előnézet a helyes kategóriákkal → „Hozzáadás" → megjelennek a hónapban.
- Teszteld a hash-importot: `http://localhost:8000/#import=<KÓD_URL_ENCODED>` → egyből az előnézet jön be.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: blokk-import (beillesztés + URL-hash + előnézet)"
```

---

### Task 15: Téma (sötét / világos / rendszer)

**Files:**
- Create: `src/theme.js`
- Modify: `styles.css`
- Modify: `src/app.js`

**Interfaces:**
- Produces:
  - `applyTheme(theme: "system"|"dark"|"light") => void` — beállítja a `data-theme` attribútumot a `<html>`-en a tényleges (rendszer szerinti vagy kényszerített) témára.
  - `watchSystemTheme(getTheme: () => string) => void` — feliratkozik a rendszer téma-változására, és ha a beállítás „system", újraalkalmazza.

- [ ] **Step 1: `src/theme.js`**

```js
export function applyTheme(theme) {
  const sysLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const eff = theme === "system" ? (sysLight ? "light" : "dark") : theme;
  document.documentElement.setAttribute("data-theme", eff);
}

export function watchSystemTheme(getTheme) {
  if (!window.matchMedia) return;
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
}
```

- [ ] **Step 2: `styles.css` — világos téma felülírások**

Told a meglévő `:root { ... }` blokk **után** ezt (a `:root` marad a sötét alap; `[data-theme="light"]` felülírja):

```css
:root[data-theme="light"] {
  --bg: #f4f6f8; --card: #ffffff; --line: #dbe2e8; --fg: #1a2029; --muted: #5c6b78;
  --accent: #2f6fed; --pos: #1c9e63; --neg: #d64545;
}
```

- [ ] **Step 3: `src/app.js` — téma alkalmazása induláskor**

```js
import { applyTheme, watchSystemTheme } from "./theme.js";
// közvetlenül a `state` létrehozása után:
applyTheme(state.db.settings.theme);
watchSystemTheme(() => state.db.settings.theme);
// (a témaváltó UI a Beállítások taskban jön; ott `applyTheme` + `commit()` fut)
```

- [ ] **Step 4: Kézi ellenőrzés**

Run: `python3 -m http.server 8000`, `http://localhost:8000`.
Expected: a `<html data-theme="...">` a rendszer beállítását tükrözi; a DevTools konzolon `document.documentElement.setAttribute('data-theme','light')` fehér témára vált; `'dark'` visszavált. Nincs hiba.

- [ ] **Step 5: Commit**

```bash
git add src/theme.js styles.css src/app.js
git commit -m "feat: téma (sötét/világos/rendszer)"
```

---

### Task 16: Emlékeztetők a modellben (CRUD + esedékesség + kifizetve)

**Files:**
- Modify: `src/model.js`
- Create: `test/reminders.test.js`

**Interfaces:**
- Consumes: `createDatabase`, `ensureMonth`, `genId`.
- Produces:
  - `addReminder(db, r) => created` — `r`: `{name, amount, note, active, freq, interval, startDate, until, notifyTime}` (`amount`/`until` lehet `null`; `freq`: `"daily"|"weekly"|"monthly"`). Ha nincs `id`, generál.
  - `updateReminder(db, id, patch) => db`
  - `deleteReminder(db, id) => db` (minden hónap `paidReminders`-éből is kiveszi)
  - `toggleReminderPaid(db, monthKey, reminderId) => db` (hozzáadja/kiveszi a hónap `paidReminders`-éből)
  - `isReminderPaid(db, monthKey, reminderId) => boolean`
  - `occurrencesInMonth(reminder, monthKey) => string[]` (az esedékességi dátumok `YYYY-MM-DD`-ként az adott hónapban, `startDate`/`until` és `interval` figyelembevételével; inaktív → `[]`)
  - `remindersDueInMonth(db, monthKey) => [{ reminder, dates: string[], paid: boolean }]` (csak aktív, aminek van esedékessége a hónapban)
  - `remindersDueOn(db, dateKey) => reminder[]` (aktív, nem kifizetett emlékeztetők, amiknek `dateKey` esedékessége; a hónap `dateKey` első 7 karakteréből)

- [ ] **Step 1: Failing tests — `test/reminders.test.js`**

```js
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
  assert.deepEqual(occurrencesInMonth(r, "2026-02"), []);       // 1 hónap múlva -> kihagy
  assert.deepEqual(occurrencesInMonth(r, "2026-03"), ["2026-03-10"]); // 2 hónap múlva
});

test("until stops occurrences", () => {
  const r = rem({ startDate: "2026-01-10", until: "2026-05-31" });
  assert.deepEqual(occurrencesInMonth(r, "2026-08"), []);
});

test("weekly lists matching weekdays within the month", () => {
  const r = rem({ freq: "weekly", interval: 1, startDate: "2026-08-03", amount: null }); // hétfő
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/reminders.test.js`
Expected: FAIL — az új exportok hiányoznak.

- [ ] **Step 3: Implement — bővítsd `src/model.js`-t**

```js
function parseDay(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function ymd(d) { return d.toISOString().slice(0, 10); }
function monthBounds(key) { const [y, m] = key.split("-").map(Number); return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) }; }

export function occurrencesInMonth(rem, monthKey) {
  if (!rem.active) return [];
  const { start: mStart, end: mEnd } = monthBounds(monthKey);
  const start = parseDay(rem.startDate);
  const until = rem.until ? parseDay(rem.until) : null;
  const interval = Math.max(1, rem.interval || 1);
  if (start > mEnd) return [];
  if (until && until < mStart) return [];
  const out = [];
  if (rem.freq === "monthly") {
    const diff = (mStart.getUTCFullYear() - start.getUTCFullYear()) * 12 + (mStart.getUTCMonth() - start.getUTCMonth());
    if (diff >= 0 && diff % interval === 0) {
      const day = Math.min(start.getUTCDate(), mEnd.getUTCDate());
      const occ = new Date(Date.UTC(mStart.getUTCFullYear(), mStart.getUTCMonth(), day));
      if (occ >= start && (!until || occ <= until)) out.push(ymd(occ));
    }
    return out;
  }
  const stepDays = rem.freq === "weekly" ? 7 * interval : interval;
  let cur = new Date(start);
  let guard = 0;
  while (cur < mStart && guard++ < 100000) cur = new Date(cur.getTime() + stepDays * 86400000);
  while (cur <= mEnd && (!until || cur <= until) && guard++ < 100000) {
    out.push(ymd(cur));
    cur = new Date(cur.getTime() + stepDays * 86400000);
  }
  return out;
}

export function addReminder(db, r) {
  const created = { id: r.id || genId("rem"), ...r };
  db.reminders.push(created);
  return created;
}
export function updateReminder(db, id, patch) {
  const r = db.reminders.find(x => x.id === id);
  if (r) Object.assign(r, patch);
  return db;
}
export function deleteReminder(db, id) {
  db.reminders = db.reminders.filter(r => r.id !== id);
  for (const key of Object.keys(db.months)) {
    const m = db.months[key];
    if (m.paidReminders) m.paidReminders = m.paidReminders.filter(x => x !== id);
  }
  return db;
}
export function isReminderPaid(db, monthKey, reminderId) {
  const m = db.months[monthKey];
  return !!(m && m.paidReminders && m.paidReminders.includes(reminderId));
}
export function toggleReminderPaid(db, monthKey, reminderId) {
  ensureMonth(db, monthKey);
  const m = db.months[monthKey];
  if (m.paidReminders.includes(reminderId)) m.paidReminders = m.paidReminders.filter(x => x !== reminderId);
  else m.paidReminders.push(reminderId);
  return db;
}
export function remindersDueInMonth(db, monthKey) {
  return db.reminders
    .filter(r => r.active)
    .map(r => ({ reminder: r, dates: occurrencesInMonth(r, monthKey), paid: isReminderPaid(db, monthKey, r.id) }))
    .filter(x => x.dates.length > 0);
}
export function remindersDueOn(db, dateKey) {
  const monthKey = dateKey.slice(0, 7);
  return db.reminders.filter(r => r.active && !isReminderPaid(db, monthKey, r.id) && occurrencesInMonth(r, monthKey).includes(dateKey));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test test/reminders.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/reminders.test.js
git commit -m "feat: emlékeztetők a modellben (CRUD, esedékesség, kifizetve)"
```

---

### Task 17: .ics naptár-fájl generálás

**Files:**
- Create: `src/ics.js`
- Create: `test/ics.test.js`

**Interfaces:**
- Produces:
  - `reminderToIcs(reminder) => string` — érvényes iCalendar szöveg: `VEVENT` `DTSTART`-tal (`startDate` + `notifyTime`), `RRULE`-lal (`FREQ`=DAILY/WEEKLY/MONTHLY, `INTERVAL`, opc. `UNTIL`), `SUMMARY`-vel (név + opc. összeg), és `VALARM` riasztással az esemény idejére. CRLF sorvégek.

- [ ] **Step 1: Failing test — `test/ics.test.js`**

```js
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
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/ics.test.js`
Expected: FAIL — `src/ics.js` hiányzik.

- [ ] **Step 3: Implement — `src/ics.js`**

```js
function esc(s) { return String(s).replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n"); }
function stamp(dateStr, time) {
  const [y, m, d] = dateStr.split("-");
  const [hh, mm] = (time || "09:00").split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}
const FREQ = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" };

export function reminderToIcs(rem) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Koltseg//HU//", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${rem.id}@koltseg`,
    `DTSTART:${stamp(rem.startDate, rem.notifyTime)}`,
    `SUMMARY:${esc(rem.name + (rem.amount ? ` – ${rem.amount} Ft` : ""))}`,
  ];
  let rrule = `RRULE:FREQ=${FREQ[rem.freq] || "MONTHLY"};INTERVAL=${Math.max(1, rem.interval || 1)}`;
  if (rem.until) rrule += `;UNTIL=${rem.until.replaceAll("-", "")}T235900Z`;
  lines.push(rrule);
  if (rem.note) lines.push(`DESCRIPTION:${esc(rem.note)}`);
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(rem.name)}`, "TRIGGER:PT0S", "END:VALARM");
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test test/ics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ics.js test/ics.test.js
git commit -m "feat: .ics naptár-fájl generálás emlékeztetőből"
```

---

### Task 18: Emlékeztetők nézet + esedékes-figyelmeztetés + „Naptárba" + helyi értesítés

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `addReminder`, `updateReminder`, `deleteReminder`, `toggleReminderPaid`, `remindersDueInMonth`, `remindersDueOn`, `addTransfer` (Task 4,16); `reminderToIcs` (Task 17).
- Produces:
  - `renderRemindersView(state, h) => HTMLElement` — emlékeztetők listája; mindegyiknél esedékesség a hónapban, „Kifizetve" kapcsoló, „Naptárba" gomb, szerkesztés; „Új emlékeztető".
  - `renderReminderForm(state, { reminder, onSave, onDelete, onCancel }) => HTMLElement` — mezők: név, összeg (opcionális), megjegyzés, ismétlődés (napi/heti/havi) + intervallum, kezdő dátum, lejárat (opcionális), értesítés ideje.
  - `renderDueBanner(state, h) => HTMLElement | null` — kiemelt kártya a hónap még ki nem fizetett esedékes emlékeztetőiről (a Hónap és Áttekintő nézet tetején). `null`, ha nincs ilyen.
  - `app.js`: `state.view === "reminders"`; a reminder-form szerkesztés; „Kifizetve"-nél opcionális kimenő utalás; „Naptárba" → `.ics` letöltés; induláskor helyi értesítés a ma esedékesekről, ha `settings.notifications` és az engedély megvan.

- [ ] **Step 1: `src/ui.js` — nézet, űrlap, banner**

```js
import { remindersDueInMonth, occurrencesInMonth } from "./model.js";

const FREQ_LABEL = { daily: "napi", weekly: "heti", monthly: "havi" };

export function renderReminderForm(state, { reminder, onSave, onDelete, onCancel }) {
  const v = reminder || { name: "", amount: "", note: "", active: true, freq: "monthly", interval: 1, startDate: todayKey(), until: "", notifyTime: "09:00" };
  const f = { ...v };
  const wrap = el("div", { class: "card" });
  wrap.append(el("h2", {}, reminder ? "Emlékeztető szerkesztése" : "Új emlékeztető"));
  const inName = el("input", { value: f.name, oninput: e => f.name = e.target.value, placeholder: "Név (pl. Törlesztő)" });
  const inAmount = el("input", { type: "number", inputmode: "numeric", min: "0", value: f.amount ?? "", oninput: e => f.amount = e.target.value === "" ? null : Number(e.target.value), placeholder: "Összeg (opcionális)" });
  const inNote = el("input", { value: f.note, oninput: e => f.note = e.target.value, placeholder: "Megjegyzés" });
  const selFreq = el("select", { onchange: e => f.freq = e.target.value },
    ...[["monthly","havi"],["weekly","heti"],["daily","napi"]].map(([val,lab]) => el("option", { value: val, ...(f.freq===val?{selected:""}:{}) }, lab)));
  const inInterval = el("input", { type: "number", inputmode: "numeric", min: "1", value: f.interval, oninput: e => f.interval = Math.max(1, Number(e.target.value)||1) });
  const inStart = el("input", { type: "date", value: f.startDate, oninput: e => f.startDate = e.target.value });
  const inUntil = el("input", { type: "date", value: f.until || "", oninput: e => f.until = e.target.value || null });
  const inTime = el("input", { type: "time", value: f.notifyTime, oninput: e => f.notifyTime = e.target.value });
  const inActive = el("select", { onchange: e => f.active = e.target.value === "yes" },
    el("option", { value: "yes", ...(f.active?{selected:""}:{}) }, "Aktív"),
    el("option", { value: "no", ...(!f.active?{selected:""}:{}) }, "Kikapcsolva"));

  wrap.append(el("label", {}, "Név"), inName);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Összeg (opcionális)"), inAmount), el("div", {}, el("label", {}, "Állapot"), inActive)));
  wrap.append(el("label", {}, "Megjegyzés"), inNote);
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Ismétlődés"), selFreq), el("div", {}, el("label", {}, "Gyakoriság (pl. 2 = kétévente/hetente)"), inInterval)));
  wrap.append(el("div", { class: "row" }, el("div", {}, el("label", {}, "Kezdő dátum"), inStart), el("div", {}, el("label", {}, "Lejárat (opcionális)"), inUntil)));
  wrap.append(el("label", {}, "Értesítés ideje"), inTime);

  const actions = el("div", { class: "row", style: "margin-top:12px" });
  actions.append(el("button", { class: "primary", onclick: () => { if (!f.name) { alert("Név kötelező."); return; } onSave(f); } }, "Mentés"));
  actions.append(el("button", { class: "ghost", onclick: onCancel }, "Mégse"));
  wrap.append(actions);
  if (reminder && onDelete) wrap.append(el("button", { class: "ghost", style: "color:var(--neg);width:100%;margin-top:8px", onclick: () => onDelete(reminder.id) }, "Törlés"));
  return wrap;
}

export function renderRemindersView(state, h) {
  const { db, month } = state;
  const wrap = el("div", {});
  wrap.append(el("div", { class: "topbar" }, el("h2", {}, "Kötelező kiadások"),
    el("button", { class: "primary", onclick: h.onAddReminder }, "Új")));
  if (!db.reminders.length) wrap.append(el("div", { class: "card muted" }, "Még nincs emlékeztető. Vedd fel a rendszeres kötelező kiadásaidat (törlesztő, TB, hitel…)."));
  for (const r of db.reminders) {
    const dates = occurrencesInMonth(r, month);
    const paid = (db.months[month]?.paidReminders || []).includes(r.id);
    const card = el("div", { class: "card" });
    card.append(el("div", { class: "cat-head" },
      el("span", {}, r.name + (r.active ? "" : " (kikapcsolva)")),
      el("span", { class: "muted" }, r.amount != null ? ft(r.amount) : "—")));
    card.append(el("div", { class: "muted", style: "margin:4px 0" },
      `${FREQ_LABEL[r.freq]}${r.interval > 1 ? ` /${r.interval}` : ""}` + (dates.length ? ` · e havi esedékesség: ${dates.join(", ")}` : " · nincs e havi esedékesség")));
    const row = el("div", { class: "row" });
    row.append(el("button", { class: paid ? "" : "primary", onclick: () => h.onTogglePaid(r) }, paid ? "Kifizetve ✓ (visszavon)" : "Kifizetve"));
    row.append(el("button", { class: "ghost", onclick: () => h.onAddToCalendar(r) }, "Naptárba"));
    card.append(row);
    card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => h.onEditReminder(r.id) }, "Szerkesztés"));
    wrap.append(card);
  }
  return wrap;
}

export function renderDueBanner(state, h) {
  const due = remindersDueInMonth(state.db, state.month).filter(x => !x.paid);
  if (!due.length) return null;
  const card = el("div", { class: "card", style: "border-color:var(--accent)" });
  card.append(el("div", { class: "cat-head" }, el("strong", {}, "Esedékes kötelező kiadás"), el("span", { class: "muted" }, `${due.length} db`)));
  card.append(el("div", { class: "muted", style: "margin-top:4px" }, due.map(x => x.reminder.name).join(", ")));
  card.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: () => { state.view = "reminders"; h.rerender(); } }, "Megnézem"));
  return card;
}
```

- [ ] **Step 2: `src/ui.js` — a banner beszúrása a Hónap és Áttekintő nézet tetejére**

A `renderMonthView` elején, a `topbar` hozzáfűzése előtt:
```js
// renderMonthView(state, h): a `wrap` létrehozása után, az első append ELÉ:
const banner1 = renderDueBanner(state, h); if (banner1) wrap.append(banner1);
```
A `renderOverview` elején hasonlóan:
```js
// renderOverview(state): a `wrap` létrehozása után, az első append ELÉ — de h kell hozzá,
// ezért a signatúra: renderOverview(state, h); a banner: const b = renderDueBanner(state, h); if (b) wrap.append(b);
```
(Frissítsd az `app.js` hívását: `renderOverview(state, handlers)`.)

- [ ] **Step 3: `src/app.js` — handler-ek, .ics letöltés, helyi értesítés**

```js
import { addReminder, updateReminder, deleteReminder, toggleReminderPaid, remindersDueOn } from "./model.js";
import { reminderToIcs } from "./ics.js";
import { renderRemindersView, renderReminderForm } from "./ui.js";

Object.assign(handlers, {
  rerender: () => render(),
  onOpenReminders: () => { state.view = "reminders"; render(); },
  onAddReminder: () => { state.editing = { type: "reminder", id: null }; render(); },
  onEditReminder: (id) => { state.editing = { type: "reminder", id }; render(); },
  onTogglePaid: (r) => {
    const wasPaid = (state.db.months[state.month]?.paidReminders || []).includes(r.id);
    toggleReminderPaid(state.db, state.month, r.id);
    if (!wasPaid && r.amount != null && confirm(`Rögzítsem "${r.name}" (${r.amount} Ft) kimenő utalásként is?`)) {
      addTransfer(state.db, state.month, { dir: "out", name: r.name, amount: r.amount, date: state.month + "-" + String(new Date().getDate()).padStart(2, "0"), partner: "", note: "kötelező kiadás" });
    }
    commit();
  },
  onAddToCalendar: (r) => { downloadText(`${r.name}.ics`, reminderToIcs(r), "text/calendar;charset=utf-8"); },
});
function saveReminder(f) {
  const cur = state.editing.id;
  if (cur == null) addReminder(state.db, f);
  else updateReminder(state.db, cur, f);
  state.editing = null; commit();
}
function removeReminder(id) { deleteReminder(state.db, id); state.editing = null; commit(); }
// render(): 
//   if (state.editing?.type === "reminder") { const r = state.editing.id ? state.db.reminders.find(x => x.id === state.editing.id) : null;
//     root.append(renderReminderForm(state, { reminder: r, onSave: saveReminder, onDelete: removeReminder, onCancel: () => { state.editing = null; render(); } })); return finishTabbar(); }
//   if (state.view === "reminders") { root.append(renderRemindersView(state, handlers)); return finishTabbar(); }

// Helyi értesítés induláskor (a render() ELSŐ hívása után, egyszer):
function notifyDueToday() {
  if (!state.db.settings.notifications) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const todayKeyStr = new Date().toISOString().slice(0, 10);
  const due = remindersDueOn(state.db, todayKeyStr);
  for (const r of due) new Notification("Ma esedékes", { body: r.name + (r.amount != null ? ` – ${r.amount} Ft` : ""), tag: "koltseg-" + r.id });
}
notifyDueToday();
```

- [ ] **Step 4: Kézi ellenőrzés**

Run: `python3 -m http.server 8000`, `http://localhost:8000`.
Expected:
- „Beállítások" → (Task 19 után) „Emlékeztetők", vagy ideiglenesen a DevTools-ból `state`-en át; vegyél fel egy havi emlékeztetőt a mai napra → a Hónap nézet tetején megjelenik az „Esedékes kötelező kiadás" banner.
- „Kifizetve" → eltűnik a bannerből; ha van összeg, felajánlja a kimenő utalást.
- „Naptárba" → `.ics` fájl töltődik le; megnyitva a naptár felajánlja a felvételt ismétlődéssel.
- Weekly/until helyesen jelenik meg az esedékességben.

- [ ] **Step 5: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: emlékeztetők nézet, esedékes-banner, naptár (.ics), helyi értesítés"
```

---

### Task 19: Beállítások menü (export, backup, téma, értesítések, linkek)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `expensesCsv`, `transfersCsv` (Task 7); `downloadBackup`, `readBackupFile` (Task 8); `applyTheme` (Task 15); reminders/kategóriák/import megnyitása.
- Produces:
  - `renderSettings(state, h) => HTMLElement` — a „Beállítások" fül tartalma: téma-választó (rendszer/sötét/világos), értesítések kapcsoló (engedélykéréssel), Export (hónap/mind), Backup mentése/visszatöltése, linkek: Emlékeztetők, Kategóriák, Blokk import.
  - `app.js`: `downloadText(name, text, type)` segéd (ha még nincs); a `settings.theme`/`settings.notifications` állítása + `applyTheme` + `commit`.

- [ ] **Step 1: `renderSettings` — `src/ui.js`**

```js
export function renderSettings(state, h) {
  const { db } = state;
  const wrap = el("div", {});
  wrap.append(el("h2", {}, "Beállítások"));

  const themeCard = el("div", { class: "card" });
  themeCard.append(el("label", {}, "Téma"));
  const selTheme = el("select", { onchange: e => h.onSetTheme(e.target.value) },
    ...[["system","Rendszer szerint"],["dark","Sötét"],["light","Világos"]].map(([v,l]) => el("option", { value: v, ...(db.settings.theme===v?{selected:""}:{}) }, l)));
  themeCard.append(selTheme);
  wrap.append(themeCard);

  const notifCard = el("div", { class: "card" });
  notifCard.append(el("div", { class: "cat-head" }, el("span", {}, "Értesítések (esedékes kötelező kiadások)"),
    el("span", { class: "muted" }, db.settings.notifications ? "Be" : "Ki")));
  notifCard.append(el("button", { class: "ghost", style: "width:100%;margin-top:8px", onclick: h.onToggleNotifications }, db.settings.notifications ? "Kikapcsolás" : "Bekapcsolás"));
  notifCard.append(el("p", { class: "muted" }, "Helyi értesítés az app nyitásakor. Zárt appnál is szóló riasztáshoz használd az emlékeztetőnél a „Naptárba" gombot."));
  wrap.append(notifCard);

  const dataCard = el("div", { class: "card" });
  const b = (label, fn, cls = "") => el("button", { class: cls, style: "width:100%;margin-bottom:8px", onclick: fn }, label);
  dataCard.append(el("label", {}, "Adatok"),
    b("Export — ez a hónap (CSV)", h.onExportMonth, "primary"),
    b("Export — minden hónap (CSV)", h.onExportAll),
    b("Backup mentése (JSON)", h.onBackup),
    b("Backup visszatöltése", h.onRestore));
  wrap.append(dataCard);

  const linksCard = el("div", { class: "card" });
  linksCard.append(el("label", {}, "Kezelés"),
    b("Kötelező kiadások / emlékeztetők", h.onOpenReminders, "primary"),
    b("Kategóriák kezelése", h.onManageCategories),
    b("Blokk import", h.onOpenImportView));
  wrap.append(linksCard);

  wrap.append(el("p", { class: "muted" }, "Az adatok a telefonon tárolódnak. Rendszeres backuppal véded őket telócsere ellen."));
  return wrap;
}
```

- [ ] **Step 2: `src/app.js` — beállítás-handler-ek + render-ág**

```js
import { renderSettings } from "./ui.js";
// downloadText már létezik? ha nem, definiáld (Task 18-ban már bevezettük).

Object.assign(handlers, {
  onSetTheme: (t) => { state.db.settings.theme = t; applyTheme(t); commit(); },
  onToggleNotifications: async () => {
    if (!state.db.settings.notifications) {
      if (!("Notification" in window)) { alert("Ez az eszköz nem támogatja az értesítéseket."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { alert("Az értesítés engedélyezése elmaradt."); return; }
      state.db.settings.notifications = true;
    } else {
      state.db.settings.notifications = false;
    }
    commit();
  },
  onExportMonth: () => { downloadText(`koltseg-kiadasok-${state.month}.csv`, expensesCsv(state.db, state.month)); downloadText(`koltseg-utalasok-${state.month}.csv`, transfersCsv(state.db, state.month)); },
  onExportAll: () => { downloadText(`koltseg-kiadasok-mind.csv`, expensesCsv(state.db, null)); downloadText(`koltseg-utalasok-mind.csv`, transfersCsv(state.db, null)); },
  onBackup: () => downloadBackup(state.db),
  onRestore: () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = async () => { try { state.db = await readBackupFile(inp.files[0]); applyTheme(state.db.settings.theme); commit(); alert("Backup visszatöltve."); } catch (e) { alert(e.message); } };
    inp.click();
  },
});
// szükséges importok a fájl tetején: expensesCsv, transfersCsv (csv.js), downloadBackup, readBackupFile (storage.js)
// render(): if (state.view === "settings") { root.append(renderSettings(state, handlers)); return finishTabbar(); }
```

- [ ] **Step 3: Kézi ellenőrzés**

Expected:
- „Beállítások" fül: téma-választó azonnal vált (rendszer/sötét/világos), F5 után megmarad.
- „Értesítések" bekapcsolása engedélyt kér; utána a mai esedékesekről nyitáskor jön értesítés (böngészőben teszteld: vegyél fel egy mára esedékes emlékeztetőt, engedélyezd, tölts újra).
- Export/backup gombok működnek; a linkek a megfelelő nézetre visznek.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/app.js
git commit -m "feat: beállítások menü (téma, értesítések, export, backup, linkek)"
```

---

### Task 20: PWA — telepíthető, offline (manifest, service worker, ikonok)

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `icons/icon-192.png`, `icons/icon-512.png`
- Modify: `src/app.js` (service worker regisztráció)

**Interfaces:**
- Produces: telepíthető, offline működő app-shell; `sw.js` az összes forrásfájlt cache-eli.

- [ ] **Step 1: `manifest.webmanifest`**

```json
{
  "name": "Költség",
  "short_name": "Költség",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#10161c",
  "theme_color": "#1f2933",
  "lang": "hu",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Ikonok generálása** (egyszerű „K" monogram, emoji nélkül)

Run:
```bash
mkdir -p icons
python3 - <<'PY'
import struct, zlib
def png(path, size, bg, fg):
    W=H=size; px=bytearray()
    def isK(x,y):
        m=size*0.18
        if x<m or x>size-m or y<m or y>size-m: return False
        if m<=x<m+size*0.12: return True
        cx=m+size*0.12
        if x>=cx:
            up=abs((y-size*0.5)+(x-cx))<size*0.09
            dn=abs((y-size*0.5)-(x-cx))<size*0.09
            return up or dn
        return False
    for y in range(H):
        px.append(0)
        for x in range(W):
            r,g,b = fg if isK(x,y) else bg
            px += bytes((r,g,b))
    def chunk(t,d):
        c=t+d; return struct.pack(">I",len(d))+c+struct.pack(">I",zlib.crc32(c)&0xffffffff)
    sig=b"\x89PNG\r\n\x1a\n"
    ihdr=struct.pack(">IIBBBBB",W,H,8,2,0,0,0)
    idat=zlib.compress(bytes(px),9)
    open(path,"wb").write(sig+chunk(b"IHDR",ihdr)+chunk(b"IDAT",idat)+chunk(b"IEND",b""))
png("icons/icon-192.png",192,(31,41,51),(76,154,255))
png("icons/icon-512.png",512,(31,41,51),(76,154,255))
print("ok")
PY
```
Expected: `icons/icon-192.png` és `icons/icon-512.png` létrejön.

- [ ] **Step 3: `sw.js`**

```js
const CACHE = "koltseg-v1";
const ASSETS = [
  ".", "index.html", "styles.css", "manifest.webmanifest",
  "src/app.js", "src/ui.js", "src/model.js", "src/storage.js", "src/codec.js",
  "src/csv.js", "src/ics.js", "src/theme.js",
  "icons/icon-192.png", "icons/icon-512.png",
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match("index.html"))));
});
```

- [ ] **Step 4: `src/app.js` — regisztráció (a fájl végén, ha még nincs)**

```js
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
```

- [ ] **Step 5: Kézi ellenőrzés**

Run: `python3 -m http.server 8000`, `http://localhost:8000`.
Expected: DevTools → Application → Manifest: „Költség" telepíthető; Service Worker aktív; Network: Offline + reload → az app betölt és működik (adatok a localStorage-ból).

- [ ] **Step 6: Commit**

```bash
git add manifest.webmanifest sw.js icons/ src/app.js
git commit -m "feat: PWA — telepíthető, offline (manifest, sw, ikonok)"
```

---

### Task 21: Élesítés — ingyenes hostolás + link a telóra

**Files:**
- Create: `README.md`

**Cél:** stabil, ingyenes URL, amit Ági megnyit a telón és a kezdőképernyőre tesz. **Ez az egyetlen lépés, ami az ő közreműködését igényli** (egy ingyenes fiók a tárhelyhez). A végrehajtáskor egyeztetjük a konkrét szolgáltatót.

**Alap-terv: GitHub Pages** (ingyenes, HTTPS, PWA/SW támogatott).

- [ ] **Step 1: `README.md`** (magyar, Áginak)

```markdown
# Költség app

Személyes költségkövető (telóra). Az adatok a telefonodon tárolódnak.

## Telepítés a telóra
1. Nyisd meg a kapott linket a telefon böngészőjében.
2. Menü → „Hozzáadás a kezdőképernyőhöz".
3. Ezután a kezdőképernyőről indul, offline is.

## Blokk beolvasása
1. A Claude appban fényképezd le a blokkot, kérd az import-kódot.
2. Az appban: Beállítások → Blokk import → illeszd be → Beolvasás → nézd át → Hozzáadás.

## Kötelező kiadások, emlékeztetők
- Beállítások → Kötelező kiadások: vedd fel a rendszereseket (törlesztő, TB, hitel).
- „Naptárba": a telefonod saját naptárába teszi, ismétlődéssel és riasztással.

## Mentés
- Beállítások → Export: Excelben nyitható CSV.
- Beállítások → Backup mentése: teljes mentés egy fájlba (telócsere ellen).
```

- [ ] **Step 2: Deploy — GitHub Pages**

Végrehajtáskor (Ági GitHub-fiókjával / engedélyével):
```bash
git branch -M main
git remote add origin https://github.com/<felhasznalo>/koltseg-app.git
git push -u origin main
# GitHub → Settings → Pages → Source: "Deploy from a branch" → main / (root) → Save
# 1-2 perc múlva: https://<felhasznalo>.github.io/koltseg-app/
```
Expected: az URL telón megnyílik, telepíthető, offline megy.

- [ ] **Step 3: Alternatíva** (jegyzet): Cloudflare Pages / Netlify „drop" — húzd be a projekt-mappát → azonnali HTTPS URL. A választást a végrehajtáskor egyeztetjük.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README + élesítési útmutató"
```

---

## Self-Review

**Spec-lefedettség:**
- Hónap → kategóriák → tételek (db-számmal, fizetési móddal) → Task 1,2,5,9,10 ✓
- Kategóriák átnevez/hozzáad/töröl (átsorolással) → Task 3,11 ✓
- Tétel szerkesztés + mozgatás → Task 2,10 ✓
- Gyorslista (megjegyzett tételek/utalások) → Task 2,4 (sablon), 10,12 (UI) ✓
- Kézi felvétel → Task 10 ✓
- Blokk-import (Claude, import-kód, előnézet, bővíthetőség) → Task 6,14 ✓
- Utalások (be/ki) + sablon → Task 4,12 ✓
- Áttekintő/kimutató (bevétel/kiadás/egyenleg, kategória-bontás, kp/kártya) → Task 5,13 ✓
- Kötelező kiadások / emlékeztetők (ismétlődés, lejárat, kifizetve) → Task 16,18 ✓
- Naptár-integráció (.ics, RRULE/VALARM/UNTIL, natív riasztás) → Task 17,18 ✓
- Értesítés (app-on belüli banner + helyi értesítés; háttér-push tudatosan kihagyva) → Task 18,19 ✓
- Beállítások menü (téma, értesítés, export, backup, linkek) → Task 19 ✓
- Téma (sötét/világos/rendszer) → Task 15,19 ✓
- Export (CSV, Excel-HU) → Task 7,19 ✓
- Backup mentés/visszatöltés → Task 8,19 ✓
- PWA (telepíthető, offline) → Task 20 ✓
- Hostolás/link → Task 21 ✓
- Globális: nincs függőség, nincs build, emoji-mentes UI, HUF, adat a telón → az egész terven át ✓

**Placeholder-ellenőrzés:** a UI-taskok `app.js`-módosításai kommentált beillesztési pontokként, konkrét kóddal szerepelnek; minden logikai task teljes kódot és teszteket tartalmaz. Nincs „TBD"/„TODO".

**Típus-konzisztencia:** a modell-alak (item/transfer/reminder/settings mezők, `paidReminders`), a függvénynevek (`addItem`, `monthOverview`, `decodeImport`, `expensesCsv`, `occurrencesInMonth`, `reminderToIcs`, `renderSettings`, `applyTheme`…) és az enumok (`payment` cash/card, `dir` in/out, `freq` daily/weekly/monthly, `theme` system/dark/light) végig egységesek.

**Ismert korlát (szándékos, YAGNI):** a UI-nak nincs automata tesztje (nincs framework); a UI-taskok kézi böngészős ellenőrzéssel zárnak. A teljes üzleti logika (modell, import, CSV, emlékeztetők, .ics) automata teszttel fedett. A valódi háttér-push (zárt appból) tudatosan kimarad — a naptár-integráció adja a megbízható, ingyenes riasztást.
