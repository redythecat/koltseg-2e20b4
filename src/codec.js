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

// Tipográfiai („okos") idézőjelek egyenesre, és a különleges szóközök simára.
// A ChatGPT/Gemini válaszából — főleg iPhone-on — gyakran ilyenek kerülnek a vágólapra,
// a JSON.parse viszont csak az egyenes " jelet fogadja el.
function normalizeQuotes(text) {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u00A0\u2007\u202F\u2009]/g, " ");
}

export function decodeImport(code) {
  const raw = String(code).trim();
  const fixed = normalizeQuotes(raw);
  // Több értelmezési próba, a legszigorúbbtól a legengedékenyebbig.
  const candidates = [];
  try { candidates.push(fromB64(raw)); } catch { /* nem base64 */ }   // kompakt kód/link
  candidates.push(raw, fixed);                                        // nyers JSON (okos idézőjelekkel is)
  for (const t of [raw, fixed]) {
    // AI-válaszból másolva: ```json kerítés vagy körítő szöveg a JSON körül
    const cleaned = t.replace(/```[a-z]*/gi, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  }
  let obj = null;
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") { obj = parsed; break; }
    } catch { /* jöhet a következő próba */ }
  }
  if (!obj) throw new Error("Érvénytelen import (se kód, se JSON).");
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
