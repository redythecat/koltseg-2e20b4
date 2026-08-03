import { createDatabase } from "./model.js";

export const KEY = "koltseg-db-v1";

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createDatabase();
    const db = JSON.parse(raw);
    if (!db || db.version !== 1 || !Array.isArray(db.categories)) return createDatabase();
    if (!db.reminders) db.reminders = [];
    if (!db.settings) db.settings = { theme: "system", notifications: false };
    if (!db.settings.accent) db.settings.accent = "blue";
    if (!db.settings.collapsed) db.settings.collapsed = {};
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
        if (!db.reminders) db.reminders = [];
        if (!db.settings) db.settings = { theme: "system", notifications: false };
        resolve(db);
      } catch {
        reject(new Error("Érvénytelen backup fájl."));
      }
    };
    fr.onerror = () => reject(new Error("Nem sikerült beolvasni a fájlt."));
    fr.readAsText(file);
  });
}
