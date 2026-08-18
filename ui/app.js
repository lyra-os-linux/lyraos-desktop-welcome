(() => {
  "use strict";
  const catalogs = window.LyraWelcomeI18n;
  const pages = [...document.querySelectorAll(".page")];
  const dots = [...document.querySelectorAll(".progress-dot")];
  let current = 0;
  let messages;

  function supportedLocale(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("es")) return "es-ES";
    return "en-US";
  }

  function applyLocale(locale) {
    const selected = catalogs[locale] ? locale : "en-US";
    messages = catalogs[selected];
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
    updatePage();
  }

  function updatePage() {
    current = Math.max(0, Math.min(current, pages.length - 1));
    pages.forEach((page, index) => {
      const active = index === current;
      page.hidden = !active;
      page.classList.toggle("active", active);
    });
    dots.forEach((dot, index) => dot.classList.toggle("active", index <= current));
    document.querySelector("#step-label").textContent = messages.step.replace("{current}", current + 1).replace("{total}", pages.length);
    document.querySelector("#back").hidden = current === 0;
    document.querySelector("#next").hidden = current === pages.length - 1;
    document.querySelector("#finish").hidden = current !== pages.length - 1;
    pages[current].querySelector("h1").focus({ preventScroll: true });
  }

  function showNetworkStatus(status) {
    const card = document.querySelector("#network-status");
    const connected = status === "connected";
    const checking = status === "checking";
    card.className = `status-card ${status}`;
    card.querySelector(".status-icon").textContent = connected ? "✓" : checking ? "◌" : "!";
    card.querySelector("strong").textContent = messages[connected ? "networkConnected" : checking ? "networkChecking" : "networkOffline"];
    card.querySelector("p").textContent = messages[connected ? "networkConnectedText" : checking ? "networkCheckingText" : "networkOfflineText"];
    document.querySelector("#open-wifi").hidden = connected || checking;
  }

  async function checkNetwork() {
    showNetworkStatus("checking");
    try {
      showNetworkStatus(await window.__TAURI__.core.invoke("network_status"));
    } catch (_) {
      showNetworkStatus("unknown");
    }
  }

  document.querySelector("#next").addEventListener("click", () => {
    current = Math.min(current + 1, pages.length - 1);
    updatePage();
  });
  document.querySelector("#back").addEventListener("click", () => {
    current = Math.max(current - 1, 0);
    updatePage();
  });
  document.querySelector("#check-network").addEventListener("click", checkNetwork);
  document.querySelector("#open-wifi").addEventListener("click", async () => {
    try { await window.__TAURI__.core.invoke("open_wifi_settings"); }
    catch (_) { showNetworkStatus("unknown"); }
  });
  document.querySelector("#open-vega").addEventListener("click", async () => {
    const status = document.querySelector("#launch-status");
    try {
      await window.__TAURI__.core.invoke("open_vega");
      status.textContent = messages.vegaOpened;
    } catch (_) {
      status.textContent = messages.vegaOpenFailed;
    }
  });
  document.querySelector("#finish").addEventListener("click", async () => {
    await window.__TAURI__.core.invoke("close_welcome");
  });

  applyLocale(supportedLocale(navigator.language));
  checkNetwork();
})();
