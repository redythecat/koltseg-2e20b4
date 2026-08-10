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
  const raw = String(code).trim();
  let obj;
  try {
    // 1) base64-elt JSON (kompakt link/kód)
    obj = JSON.parse(fromB64(raw));
  } catch {
    try {
      // 2) sima JSON is mehet (bemásolva)
      obj = JSON.parse(raw);
    } catch {
      // 3) AI-válaszból másolva: ```json kerítés vagy körítő szöveg a JSON körül
      //    (ChatGPT és Gemini gyakran így adja vissza) — kivesszük belőle a { ... } részt.
      const cleaned = raw.replace(/```[a-z]*/gi, "");
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("Érvénytelen import (se kód, se JSON).");
      try {
        obj = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throw new Error("Érvénytelen import (se kód, se JSON).");
      }
    }
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
