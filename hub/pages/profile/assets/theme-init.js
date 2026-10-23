(() => {
  const storedTheme = localStorage.getItem("color-theme");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const theme = storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : systemTheme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
