// Minimál XLSX (Office Open XML) író, külső könyvtár nélkül.
// Egy munkafüzet több munkalappal; a számok számként, a szöveg szövegként kerül a cellákba.

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function colRef(n) {
  let s = "";
  n++;
  while (n) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

// rows: cellák tömbjeinek tömbje (string | number)
export function sheetXml(rows) {
  let body = "";
  rows.forEach((row, r) => {
    let cells = "";
    row.forEach((v, c) => {
      const ref = colRef(c) + (r + 1);
      if (typeof v === "number" && Number.isFinite(v)) {
        cells += `<c r="${ref}"><v>${v}</v></c>`;
      } else {
        cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v == null ? "" : v)}</t></is></c>`;
      }
    });
    body += `<row r="${r + 1}">${cells}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

// --- Adatból sorok ---

export function expenseRows(db, monthKey) {
  const cat = id => (db.categories.find(c => c.id === id) || {}).name || "";
  const pay = p => (p === "cash" ? "Készpénz" : "Kártya");
  const keys = monthKey === null ? Object.keys(db.months).sort() : [monthKey];
  const rows = [["Hónap", "Dátum", "Kategória", "Név", "Db", "Ár", "Üzlet", "Fizetés"]];
  for (const mk of keys) {
    const m = db.months[mk];
    if (!m) continue;
    for (const it of m.items) rows.push([mk, it.date, cat(it.categoryId), it.name, it.qty, Math.round(it.price), it.store, pay(it.payment)]);
  }
  return rows;
}

export function transferRows(db, monthKey) {
  const dir = d => (d === "in" ? "Bejövő" : d === "swap" ? "Átvezetés" : "Kimenő");
  const SWAP_KIND = { withdraw: "Készpénzfelvétel", deposit: "Befizetés kártyára", person: "Csere" };
  const FLOW = { card2cash: "kártya → kp", cash2card: "kp → kártya" };
  const mode = t => (t.dir === "swap"
    ? (SWAP_KIND[t.kind] || "Átvezetés") + (t.kind === "person" && t.flow ? ` (${FLOW[t.flow]})` : "")
    : (t.method === "cash" ? "Készpénz" : "Utalás"));
  const keys = monthKey === null ? Object.keys(db.months).sort() : [monthKey];
  const rows = [["Hónap", "Dátum", "Irány", "Mód", "Megnevezés", "Összeg", "Partner", "Megjegyzés"]];
  for (const mk of keys) {
    const m = db.months[mk];
    if (!m) continue;
    for (const t of m.transfers) rows.push([mk, t.date, dir(t.dir), mode(t), t.name, Math.round(t.amount), t.partner, t.note]);
  }
  return rows;
}

// --- ZIP csomagolás (tömörítés nélkül, "stored") ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// sheets: [{ name, rows }]  ->  Uint8Array (.xlsx tartalom)
export function buildXlsxBytes(sheets) {
  const enc = new TextEncoder();
  const parts = [];
  const add = (name, str) => parts.push({ name, data: enc.encode(str) });

  const overrides = sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  add("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`);
  add("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  const sheetTags = sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  add("xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`);
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  add("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)));

  // ZIP összeállítás
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  const DOS_DATE = 0x21, DOS_TIME = 0; // 1980-01-01

  for (const p of parts) {
    const nameBytes = enc.encode(p.name);
    const crc = crc32(p.data);
    const size = p.data.length;
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(local), nameBytes, p.data);
    const localLen = local.length + nameBytes.length + size;
    central.push({ nameBytes, crc, size, offset });
    offset += localLen;
  }

  const cdStart = offset;
  const cd = [];
  for (const c of central) {
    cd.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE),
      ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset),
    );
    cd.push(...c.nameBytes);
  }
  const cdBytes = new Uint8Array(cd);
  chunks.push(cdBytes);
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(cdBytes.length), ...u32(cdStart), ...u16(0),
  ];
  chunks.push(new Uint8Array(eocd));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

// Böngészőben: xlsx blob letöltése
export function downloadXlsx(sheets, filename) {
  const bytes = buildXlsxBytes(sheets);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
