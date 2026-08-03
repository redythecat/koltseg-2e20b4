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
