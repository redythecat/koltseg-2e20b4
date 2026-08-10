import { createDatabase, daysBetween, todayKey, genId } from "./model.js";

export const KEY = "koltseg-db-v1";
export const BACKUPS_KEY = "koltseg-backups-v1";
export const AUTO_KEY = "koltseg-autobackup-last";
const MAX_SNAPSHOTS = 10;

function normalize(db) {
  if (!db.reminders) db.reminders = [];
  if (!db.settings) db.settings = { theme: "system", notifications: false };
  if (!db.settings.accent) db.settings.accent = "blue";
  if (!db.settings.collapsed) db.settings.collapsed = {};
  if (!db.settings.fontScale || db.settings.fontScale === "large") db.settings.fontScale = "normal";
  if (![2, 4, 7].includes(db.settings.autoBackupDays)) db.settings.autoBackupDays = 4;
  if (db.templates && Array.isArray(db.templates.items)) for (const t of db.templates.items) if (!t.id) t.id = genId("tpl");
  if (db.templates && Array.isArray(db.templates.transfers)) for (const t of db.templates.transfers) if (!t.id) t.id = genId("ttpl");
  // Régi adat: a „Kifizetve" gombbal rögzített kimenők jegyzetéről ismerjük fel a kötelezőt.
  for (const key of Object.keys(db.months || {})) {
    for (const t of db.months[key].transfers || []) {
      if (t.dir === "out" && t.mandatory === undefined && t.note === "kötelező kiadás") t.mandatory = true;
    }
  }
  return db;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createDatabase();
    const db = JSON.parse(raw);
    if (!db || db.version !== 1 || !Array.isArray(db.categories)) return createDatabase();
    return normalize(db);
  } catch {
    return createDatabase();
  }
}

export function save(db) {
  const json = JSON.stringify(db);
  try {
    localStorage.setItem(KEY, json);
  } catch (e) {
    // Megtelt a tárhely — próbáljuk felszabadítani a legrégebbi auto-mentés eldobásával.
    const list = listBackups();
    while (list.length) {
      list.pop();
      localStorage.setItem(BACKUPS_KEY, JSON.stringify(list));
      try { localStorage.setItem(KEY, json); return; } catch { /* még mindig tele */ }
    }
    throw new Error("Megtelt a telón a tárhely. Ments ki egy biztonsági mentést, és törölj régi tételeket.");
  }
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

// --- Belső (telón tárolt) auto-mentések ---

export function listBackups() {
  try {
    const raw = localStorage.getItem(BACKUPS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addSnapshot(db, reason) {
  const now = new Date();
  const stamp = `${todayKey()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const list = listBackups();
  list.unshift({ date: stamp, reason: reason || "", data: JSON.parse(JSON.stringify(db)) });
  localStorage.setItem(BACKUPS_KEY, JSON.stringify(list.slice(0, MAX_SNAPSHOTS)));
}

// Tisztán tesztelhető: melyik mentések maradnak (a maxDays napnál nem régebbiek).
export function filterFreshBackups(list, today, maxDays) {
  return list.filter(sn => {
    const d = String(sn.date || "").slice(0, 10);
    const age = daysBetween(d, today);
    return Number.isFinite(age) && age <= maxDays;
  });
}

// A telefonon tárolt, maxDays napnál régebbi mentések törlése; a töröltek számát adja vissza.
export function pruneOldBackups(maxDays = 7) {
  const list = listBackups();
  const kept = filterFreshBackups(list, todayKey(), maxDays);
  if (kept.length !== list.length) localStorage.setItem(BACKUPS_KEY, JSON.stringify(kept));
  return list.length - kept.length;
}

// Automatikus mentés megnyitáskor: ha eltelt a beállított számú nap (2/4/7) az utolsó óta
// és van mit menteni. Igaz értékkel tér vissza, ha most készített egy mentést.
export function maybeAutoBackup(db) {
  const hasData = (db.reminders && db.reminders.length) ||
    Object.values(db.months || {}).some(m => (m.items && m.items.length) || (m.transfers && m.transfers.length));
  if (!hasData) return false;
  const days = [2, 4, 7].includes(db.settings?.autoBackupDays) ? db.settings.autoBackupDays : 4;
  const today = todayKey();
  const last = localStorage.getItem(AUTO_KEY);
  if (last && daysBetween(last, today) < days) return false;
  addSnapshot(db, `automatikus (${days} naponta)`);
  localStorage.setItem(AUTO_KEY, today);
  return true;
}

// Fájlba mentés: iPhone-on/Androidon a megosztó-lap (iCloud/Drive/email), különben letöltés.
export async function shareOrDownloadBackup(db) {
  const json = JSON.stringify(db, null, 2);
  const name = `koltseg-backup-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const file = new File([json], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Költség backup" });
      return;
    }
  } catch { /* megszakítás vagy nem támogatott → letöltés */ }
  downloadBackup(db);
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const db = JSON.parse(fr.result);
        if (!db || db.version !== 1 || !Array.isArray(db.categories)) throw new Error("bad");
        resolve(normalize(db));
      } catch {
        reject(new Error("Érvénytelen backup fájl."));
      }
    };
    fr.onerror = () => reject(new Error("Nem sikerült beolvasni a fájlt."));
    fr.readAsText(file);
  });
}
