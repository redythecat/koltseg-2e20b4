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
