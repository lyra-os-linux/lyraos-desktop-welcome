(() => {
  "use strict";
  const catalogs = window.LyraWelcomeI18n;

  function supportedLocale(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("es")) return "es-ES";
    return "en-US";
  }

  function applyLocale(locale) {
    const selected = catalogs[locale] ? locale : "en-US";
    const messages = catalogs[selected];
    document.documentElement.lang = selected;
    document.title = messages.title;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const value = messages[element.dataset.i18n];
      if (value) element.textContent = value;
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      const value = messages[element.dataset.i18nAria];
      if (value) element.setAttribute("aria-label", value);
    });
  }

  document.querySelector("#start").addEventListener("click", async () => {
    await window.__TAURI__.core.invoke("close_welcome");
  });
  applyLocale(supportedLocale(navigator.language));
})();
