function esc(s) { return String(s).replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n"); }

// Google Naptár „esemény mentése" link, előre kitöltve — a felhasználónak csak a
// Mentés-t kell megnyomnia. (Webes app közvetlenül nem írhat a telefon naptárába.)
export function reminderToGoogleUrl(rem) {
  const start = stamp(rem.startDate, rem.notifyTime);
  // fél órás esemény, hogy legyen látható kiterjedése a naptárban (éjfélnél plafonozva)
  const [hh, mm] = (rem.notifyTime || "09:00").split(":").map(Number);
  const endMinutes = Math.min(hh * 60 + mm + 30, 23 * 60 + 59);
  const end = `${start.slice(0, 9)}${String(Math.floor(endMinutes / 60)).padStart(2, "0")}${String(endMinutes % 60).padStart(2, "0")}00`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: rem.name + (rem.amount ? ` – ${rem.amount} Ft` : ""),
    dates: `${start}/${end}`,
  });
  if (rem.note) p.set("details", rem.note);
  if (rem.freq && rem.freq !== "none") {
    let rrule = `RRULE:FREQ=${FREQ[rem.freq] || "MONTHLY"};INTERVAL=${Math.max(1, rem.interval || 1)}`;
    if (rem.until) rrule += `;UNTIL=${rem.until.replaceAll("-", "")}T235900Z`;
    p.set("recur", rrule);
  }
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
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
  if (rem.freq && rem.freq !== "none") {
    let rrule = `RRULE:FREQ=${FREQ[rem.freq] || "MONTHLY"};INTERVAL=${Math.max(1, rem.interval || 1)}`;
    if (rem.until) rrule += `;UNTIL=${rem.until.replaceAll("-", "")}T235900Z`;
    lines.push(rrule);
  }
  if (rem.note) lines.push(`DESCRIPTION:${esc(rem.note)}`);
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(rem.name)}`, "TRIGGER:PT0S", "END:VALARM");
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
