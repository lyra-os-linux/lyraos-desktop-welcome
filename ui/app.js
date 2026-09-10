(() => {
  "use strict";
  const catalogs = window.LyraWelcomeI18n;
  const pages = [...document.querySelectorAll(".page")];
  const dots = [...document.querySelectorAll(".progress-dot")];
  const themeCards = [...document.querySelectorAll(".theme-card")];
  const profileCards = [...document.querySelectorAll(".profile-card")];
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

  // Both pickers are radiogroups over a pair of cards; the only thing that
  // differs is which preview element mirrors the choice.
  function markChoice(cards, attribute, selected, preview) {
    cards.forEach((card) => {
      const active = card.dataset[attribute] === selected;
      card.setAttribute("aria-checked", String(active));
      card.classList.toggle("selected", active);
      // Only the selected card stays in the tab order, as a radiogroup should.
      card.tabIndex = active || (!selected && card === cards[0]) ? 0 : -1;
    });
    preview.element.hidden = !selected;
    preview.element.className = selected ? `${preview.base} ${selected}` : preview.base;
  }

  function selectedOf(cards, attribute, fallback) {
    const card = cards.find((item) => item.getAttribute("aria-checked") === "true");
    return card ? card.dataset[attribute] : fallback;
  }

  function bindArrowKeys(group, cards, attribute, fallback, choose) {
    group.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const current_value = selectedOf(cards, attribute, fallback);
      const target = cards.find((card) => card.dataset[attribute] !== current_value);
      if (!target || target.disabled) return;
      choose(target.dataset[attribute]);
      target.focus();
    });
  }

  function markTheme(selected) {
    markChoice(themeCards, "theme", selected, {
      element: document.querySelector("#theme-preview"),
      base: "scheme-preview",
    });
    // Repaint the welcome window itself, so the choice is shown rather than
    // only described. Without the attribute, styles.css falls back to
    // prefers-color-scheme, which is what an unavailable backend leaves us.
    if (selected) document.documentElement.dataset.scheme = selected;
    else delete document.documentElement.dataset.scheme;
  }

  function markProfile(selected) {
    markChoice(profileCards, "profile", selected, {
      element: document.querySelector("#profile-preview"),
      base: "desktop-preview",
    });
  }

  // A picker owns its entire read/write/read cycle. Keeping the controls locked
  // until readback finishes also prevents startup reads or rapid clicks from
  // overwriting a newer choice. Never infer the applied value from a set exit code.
  function createPicker(kind, cards, attribute, mark, read, write) {
    const group = document.querySelector(`#${kind}-choice`);
    const status = document.querySelector(`#${kind}-status`);
    const valid = (value) => cards.some((card) => card.dataset[attribute] === value);
    let busy = true;
    let available = false;

    function lock(value) {
      busy = value;
      group.setAttribute("aria-busy", String(value));
      // Disabled buttons lose focus. Park it on the group while waiting, then
      // restore it only if the user has not moved elsewhere in the meantime.
      if (value && cards.includes(document.activeElement)) {
        group.tabIndex = -1;
        group.focus();
      }
      cards.forEach((card) => { card.disabled = value || !available; });
      if (!value && available && document.activeElement === group) {
        cards.find((card) => card.getAttribute("aria-checked") === "true").focus();
      }
    }

    async function refresh() {
      let value;
      try { value = await read(); } catch (_) { value = null; }
      available = valid(value);
      mark(available ? value : null);
      return available ? value : null;
    }

    mark(null);
    lock(true);
    return {
      async load() {
        await refresh();
        status.textContent = available ? "" : messages[`${kind}Unavailable`];
        lock(false);
      },
      async choose(value) {
        if (busy || !available || !valid(value)) return;
        lock(true);
        status.textContent = messages[`${kind}Applying`];
        let succeeded = true;
        try { await write(value); } catch (_) { succeeded = false; }
        // A failed write may have applied partially. Read even on error; if the
        // read fails too, clear the selection instead of claiming an old value.
        const actual = await refresh();
        status.textContent = messages[!available ? `${kind}Unavailable`
          : succeeded && actual === value ? `${kind}Applied` : `${kind}Failed`];
        lock(false);
      },
    };
  }

  const themePicker = createPicker("theme", themeCards, "theme", markTheme,
    () => window.__TAURI__.core.invoke("color_scheme"),
    (theme) => window.__TAURI__.core.invoke("set_color_scheme", { theme }));
  const profilePicker = createPicker("profile", profileCards, "profile", markProfile,
    () => window.__TAURI__.core.invoke("desktop_profile"),
    (profile) => window.__TAURI__.core.invoke("set_desktop_profile", { profile }));
  const chooseTheme = (theme) => themePicker.choose(theme);
  const chooseProfile = (profile) => profilePicker.choose(profile);

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
  themeCards.forEach((card) => {
    card.addEventListener("click", () => chooseTheme(card.dataset.theme));
  });
  bindArrowKeys(document.querySelector("#theme-choice"), themeCards, "theme", "dark", chooseTheme);
  profileCards.forEach((card) => {
    card.addEventListener("click", () => chooseProfile(card.dataset.profile));
  });
  bindArrowKeys(document.querySelector("#profile-choice"), profileCards, "profile", "lyra", chooseProfile);
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
  themePicker.load();
  profilePicker.load();
  checkNetwork();
})();
