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
