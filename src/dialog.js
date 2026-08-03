// Appon belüli értesítések és megerősítő ablakok (a böngésző beépített
// alert/confirm/prompt helyett, amik odaírják a csúnya URL-t).

function overlay() {
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  document.body.appendChild(ov);
  return ov;
}
function close(ov) { ov.remove(); }

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
    ov.onclick = (e) => { if (e.target === ov) { close(ov); resolve(false); } };
    row.append(cancel, ok);
    box.append(p, row);
    ov.append(box);
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
  }

  draw();
  ov.onclick = (e) => { if (e.target === ov) close(ov); };
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
    ov.onclick = (e) => { if (e.target === ov) { close(ov); resolve(null); } };
    box.append(cancel);
    ov.append(box);
  });
}
