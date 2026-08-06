// Appon belüli értesítések és megerősítő ablakok (a böngésző beépített
// alert/confirm/prompt helyett, amik odaírják a csúnya URL-t).

function overlay() {
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  document.body.appendChild(ov);
  return ov;
}
function close(ov) { ov.remove(); }

// Bezárás háttérre koppintással ÉS a telefon Vissza gombjával (app.js az ov.__dismiss-t hívja).
function wireDismiss(ov, fn) {
  ov.onclick = (e) => { if (e.target === ov) fn(); };
  ov.__dismiss = fn;
}

// Bezáró X az ablak jobb felső sarkában. onClose: mit tegyen bezáráskor.
function closeX(box, onClose) {
  const b = document.createElement("button");
  b.className = "modal-x";
  b.type = "button";
  b.setAttribute("aria-label", "Bezárás");
  b.textContent = "×";
  b.onclick = onClose;
  box.prepend(b);   // elöl kell lennie: lebeg + tapad, így görgetéskor is látszik
  return b;
}

// Tetszőleges tartalmú felugró ablak (pl. kis szerkesztő űrlapok).
// A visszakapott függvénnyel bezárható; a Vissza-gomb is ezt hívja (ov.__dismiss).
export function panelModal(title, node, onClose) {
  const ov = overlay();
  const box = document.createElement("div");
  box.className = "modal panel";
  const h = document.createElement("h3");
  h.textContent = title;
  h.style.margin = "0 0 12px";
  box.append(h, node);
  const dismiss = () => { close(ov); if (onClose) onClose(); };
  closeX(box, dismiss);
  wireDismiss(ov, dismiss);
  ov.append(box);
  return () => close(ov);   // bezárás visszahívás nélkül (pl. mentés után)
}

export function toast(message) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2800);
}

export function confirmModal(message, { okText = "Igen", cancelText = "Mégse", danger = false } = {}) {
  return new Promise((resolve) => {
    const ov = overlay();
    const box = document.createElement("div");
    box.className = "modal";
    const p = document.createElement("p");
    p.className = "modal-msg";
    p.textContent = message;
    const row = document.createElement("div");
    row.className = "modal-actions";
    const ok = document.createElement("button");
    ok.className = danger ? "danger" : "primary";
    ok.textContent = okText;
    const cancel = document.createElement("button");
    cancel.className = "ghost";
    cancel.textContent = cancelText;
    ok.onclick = () => { close(ov); resolve(true); };
    cancel.onclick = () => { close(ov); resolve(false); };
    wireDismiss(ov, () => { close(ov); resolve(false); });
    row.append(cancel, ok);
    box.append(p, row);
    closeX(box, () => { close(ov); resolve(false); });
    ov.append(box);
  });
}

// Rövid "Hogyan használd" súgó.
export function helpModal() {
  const sections = [
    ["Tétel felvétele", ["„Új tétel” gombbal kézzel, vagy a Gyorslistából egy koppintással (a korábban felvett tételeidből).", "Ha megadsz darabszámot, az ár magától szorzódik az egységárral."]],
    ["Blokk bevitele", ["Beállítások → Blokk bevitel → „Beolvasó szöveg másolása”.", "A Claude appban illeszd be a blokk fotójával. Válaszul egy JSON-t kapsz — azt másold vissza ide a beviteli mezőbe, és nyomd meg a „Beolvasás” gombot.", "Az előnézetben átállíthatod a kategóriát, és egy tétel nevét hosszan nyomva szerkesztheted (név, üzlet, darab, ár)."]],
    ["Elmentett tételek", ["Amit felviszel, magától bekerül a gyorslistába — Beállítások → Elmentett tételek alatt kereshető, szerkeszthető, törölhető (külön a kiadás-tételek és a pénzmozgások).", "Az elmentett ár az egységár. Ha ezt átírod, a régen felvitt kiadásaid nem változnak."]],
    ["Kötelező kiadások", ["Vedd fel a rendszereseket (törlesztő, TB, hitel), és add meg, kártyával vagy készpénzzel fizeted.", "A „Naptárba” gomb a telefon naptárába teszi, riasztással.", "A Kiadások tetején mindig látod az esedékeseket, és kipipálhatod, ha fizetted — ilyenkor felajánlja, hogy rögzítse kimenő pénzmozgásként is."]],
    ["Havi keret", ["A kategóriánál megadhatsz havi limitet; a Kiadásoknál sáv mutatja, hol tartasz, és pirosra vált túllépéskor."]],
    ["Pénzmozgás", ["Bejövő: fizetés, érkező utalások. Kimenő: albérlet, törlesztő, bármi, amit fizetsz.", "A kimenőnél pipálhatod, hogy kötelező kiadás-e. Amit a „Kifizetve” gombbal rögzítesz, az magától kötelező lesz.", "Átvezetés: készpénzfelvétel, kártyára befizetés vagy csere valakivel. Ez csak napló — egyik összesítésbe sem számít bele."]],
    ["Áttekintő", ["Bevétel/kiadás/egyenleg, összehasonlítás az előző hónappal és hó végi becslés.", "Alul Havi és Éves statisztika: összes, kötelező, egyéb és bolti kiadás, készpénz/kártya bontással."]],
    ["Kilépés", ["Nyomd meg kétszer a telefon Vissza gombját — az első után lent megjelenik egy üzenet, hogy véletlenül ne lépj ki."]],
    ["Mentés (fontos!)", ["Havonta egyszer: Beállítások → „Biztonsági mentés fájlba”, és tedd felhőbe/emailbe.", "Az app hetente magától is ment a telóra (Beállítások → Visszaállítás)."]],
    ["Excel", ["A Beállítások → Excel táblázat csak megnézésre/nyomtatásra való, nem visszaállításra."]],
    ["Kinézet", ["Beállításokban: sötét/világos téma, kiemelő szín, betűméret."]],
  ];
  const ov = overlay();
  const box = document.createElement("div");
  box.className = "modal help";
  const h = document.createElement("h3");
  h.textContent = "Hogyan használd";
  h.style.margin = "0 0 12px";
  box.append(h);
  for (const [title, items] of sections) {
    const head = document.createElement("div");
    head.className = "cl-head";
    head.textContent = title;
    box.append(head);
    const ul = document.createElement("ul");
    ul.className = "cl-list";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = it;
      ul.append(li);
    }
    box.append(ul);
  }
  const close_ = document.createElement("button");
  close_.className = "primary";
  close_.style.cssText = "width:100%;margin-top:8px";
  close_.textContent = "Bezárás";
  close_.onclick = () => close(ov);
  box.append(close_);
  closeX(box, () => close(ov));
  wireDismiss(ov, () => close(ov));
  ov.append(box);
}

// Kis szerkesztő ablak. fields: [{ key, label, value }] -> Promise<{...}|null>
export function formModal(title, fields) {
  return new Promise((resolve) => {
    const ov = overlay();
    const box = document.createElement("div");
    box.className = "modal";
    const h = document.createElement("h3");
    h.textContent = title;
    h.style.margin = "0 0 12px";
    box.append(h);
    const inputs = {};
    for (const fld of fields) {
      const lab = document.createElement("label");
      lab.textContent = fld.label;
      const inp = document.createElement("input");
      if (fld.type) inp.type = fld.type;
      if (fld.type === "number") inp.inputMode = "numeric";
      if (fld.min != null) inp.min = fld.min;
      inp.value = fld.value == null ? "" : fld.value;
      inputs[fld.key] = inp;
      box.append(lab, inp);
    }
    const row = document.createElement("div");
    row.className = "modal-actions";
    row.style.marginTop = "14px";
    const ok = document.createElement("button");
    ok.className = "primary";
    ok.textContent = "Mentés";
    const cancel = document.createElement("button");
    cancel.className = "ghost";
    cancel.textContent = "Mégse";
    ok.onclick = () => { const out = {}; for (const k of Object.keys(inputs)) out[k] = inputs[k].value; close(ov); resolve(out); };
    cancel.onclick = () => { close(ov); resolve(null); };
    wireDismiss(ov, () => { close(ov); resolve(null); });
    row.append(cancel, ok);
    box.append(row);
    closeX(box, () => { close(ov); resolve(null); });
    ov.append(box);
    setTimeout(() => { const first = inputs[fields[0]?.key]; if (first) first.focus(); }, 30);
  });
}

// Verzió-napló ablak. entries: [{ v, date, notes: [...] }]
// 20 soronként tölt be (egy bejegyzés fejléce + pontjai = sorok), hogy ne terhelje az eszközt.
const CHANGELOG_PAGE_ROWS = 20;
export function changelogModal(entries) {
  const ov = overlay();
  const box = document.createElement("div");
  box.className = "modal changelog";
  let shown = CHANGELOG_PAGE_ROWS;

  function draw() {
    box.replaceChildren();
    const h = document.createElement("h3");
    h.textContent = "Mi újult meg?";
    h.style.margin = "0 0 12px";
    box.append(h);

    let rows = 0;
    let rendered = 0;
    for (const e of entries) {
      if (rows >= shown) break;             // egész bejegyzéseket tartunk együtt
      const head = document.createElement("div");
      head.className = "cl-head";
      head.textContent = `${e.v} · ${e.date}`;
      box.append(head);
      const ul = document.createElement("ul");
      ul.className = "cl-list";
      for (const n of e.notes) {
        const li = document.createElement("li");
        li.textContent = n;
        ul.append(li);
      }
      box.append(ul);
      rows += 1 + e.notes.length;
      rendered++;
    }

    if (rendered < entries.length) {
      const more = document.createElement("button");
      more.className = "ghost";
      more.style.cssText = "width:100%;margin-top:8px";
      more.textContent = "Több betöltése";
      more.onclick = () => { shown += CHANGELOG_PAGE_ROWS; draw(); };
      box.append(more);
    }
    const close_ = document.createElement("button");
    close_.className = "primary";
    close_.style.cssText = "width:100%;margin-top:8px";
    close_.textContent = "Bezárás";
    close_.onclick = () => close(ov);
    box.append(close_);
    closeX(box, () => close(ov));   // a draw() újrarajzol, ezért itt kerül vissza
  }

  draw();
  wireDismiss(ov, () => close(ov));
  ov.append(box);
}

// options: [{ label, value }]; visszaad egy value-t vagy null-t (mégse).
export function choiceModal(message, options) {
  return new Promise((resolve) => {
    const ov = overlay();
    const box = document.createElement("div");
    box.className = "modal";
    const p = document.createElement("p");
    p.className = "modal-msg";
    p.textContent = message;
    box.append(p);
    for (const o of options) {
      const b = document.createElement("button");
      b.className = o.danger ? "danger" : "";
      b.style.cssText = "width:100%;margin-bottom:8px";
      b.textContent = o.label;
      b.onclick = () => { close(ov); resolve(o.value); };
      box.append(b);
    }
    const cancel = document.createElement("button");
    cancel.className = "ghost";
    cancel.style.cssText = "width:100%";
    cancel.textContent = "Mégse";
    cancel.onclick = () => { close(ov); resolve(null); };
    wireDismiss(ov, () => { close(ov); resolve(null); });
    box.append(cancel);
    closeX(box, () => { close(ov); resolve(null); });
    ov.append(box);
  });
}
