// Sötétben és világosban is jól olvasható, közepesen világos árnyalatok
// (a gombokon sötét szöveg van rajtuk).
export const ACCENTS = {
  blue:   { label: "Kék",      hex: "#4c9aff" },
  green:  { label: "Zöld",     hex: "#34c77b" },
  purple: { label: "Lila",     hex: "#a78bfa" },
  orange: { label: "Narancs",  hex: "#ff9f45" },
  pink:   { label: "Rózsa",    hex: "#ff7eb6" },
  teal:   { label: "Türkiz",   hex: "#3fd0c9" },
};

export function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.blue;
  document.documentElement.style.setProperty("--accent", a.hex);
}

export function applyTheme(theme) {
  const sysLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const eff = theme === "system" ? (sysLight ? "light" : "dark") : theme;
  document.documentElement.setAttribute("data-theme", eff);
}

export function watchSystemTheme(getTheme) {
  if (!window.matchMedia) return;
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
}
