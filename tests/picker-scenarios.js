// Shared by the Node DOM fixture and the real WebKitGTK document. Only Tauri's
// IPC is simulated: every event below exercises the shipped app.js handlers.
(() => {
  const pending = [];
  const history = [];
  window.__TAURI__ = { core: { invoke(command, args) {
    history.push({ command, args });
    if (command === "network_status") return Promise.resolve("connected");
    return new Promise((resolve, reject) => pending.push({ command, args, resolve, reject }));
  } } };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  async function reply(command, value, error = false) {
    const index = pending.findIndex((item) => item.command === command);
    assert(index >= 0, `Missing IPC call: ${command}`);
    const call = pending.splice(index, 1)[0];
    error ? call.reject(new Error(value)) : call.resolve(value);
    await tick();
  }
  const cases = [];
  for (const [kind, read, write, initial, next] of [
    ["theme", "color_scheme", "set_color_scheme", "dark", "light"],
    ["profile", "desktop_profile", "set_desktop_profile", "lyra", "vanilla"],
  ]) {
    const cards = () => [...document.querySelectorAll(`.${kind}-card`)];
    const group = () => document.querySelector(`#${kind}-choice`);
    const preview = () => document.querySelector(`#${kind}-preview`);
    const card = (value) => cards().find((item) => item.dataset[kind] === value);
    const click = (value) => card(value).click();
    const arrow = () => group().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const count = () => history.filter((item) => item.command === write).length;
    const status = (suffix) => assert(document.querySelector(`#${kind}-status`).textContent ===
      window.LyraWelcomeI18n[document.documentElement.lang][`${kind}${suffix}`], `Wrong ${kind} status: ${suffix}`);
    const locked = (value) => assert(cards().every((item) => item.disabled === value), `${kind} lock should be ${value}`);
    function selected(value) {
      for (const item of cards()) {
        const expected = item.dataset[kind] === value;
        assert(item.getAttribute("aria-checked") === String(expected), `${kind}: incorrect checked state for ${item.dataset[kind]}`);
        assert(item.classList.contains("selected") === expected, `${kind}: incorrect selected class`);
        if (value) assert(item.tabIndex === (expected ? 0 : -1), `${kind}: tab order differs from confirmed value`);
      }
      assert(preview().hidden === !value, `${kind}: preview visibility differs from known state`);
      if (value) assert(preview().classList.contains(value), `${kind}: wrong preview`);
      if (kind === "theme") assert(document.documentElement.dataset.scheme === (value || undefined), "Window scheme differs from confirmed theme");
    }
    function add(name, run) { cases.push({ name: `${kind}: ${name}`, run }); }
    add("startup read locks input and clears assumed defaults", async () => {
      locked(true); selected(null); click(next); arrow();
      assert(count() === 0, "Write raced with startup read");
      await reply(read, initial); selected(initial); locked(false);
    });
    add("success waits for readback, including keyboard activation", async () => {
      await reply(read, initial); arrow();
      selected(initial); locked(true); status("Applying");
      await reply(write, null); selected(initial); locked(true);
      await reply(read, next); selected(next); locked(false); status("Applied");
    });
    add("non-writable key keeps actual choice and allows retry", async () => {
      await reply(read, initial); click(next);
      await reply(write, "The key is not writable", true);
      await reply(read, initial); selected(initial); locked(false); status("Failed");
      click(next); await reply(write, null); await reply(read, next);
      selected(next); status("Applied"); assert(count() === 2, "Retry missing");
    });
    add("successful command with unchanged backend is not success", async () => {
      await reply(read, initial); click(next); await reply(write, null);
      await reply(read, initial); selected(initial); status("Failed"); locked(false);
    });
    add("failed command with a partial change uses actual state", async () => {
      await reply(read, initial); click(next); await reply(write, "Reply lost", true);
      await reply(read, next); selected(next); status("Failed"); locked(false);
    });
    for (const writeFails of [false, true]) {
      add(`lost readback after ${writeFails ? "failed" : "successful"} write clears state`, async () => {
        await reply(read, initial); click(next); await reply(write, "Backend disconnected", writeFails);
        await reply(read, "Backend disconnected", true);
        selected(null); locked(true); status("Unavailable");
        click(initial); arrow(); assert(count() === 1, "Unavailable picker wrote again");
      });
    }
    for (const value of ["unavailable", "unexpected", null]) {
      add(`unavailable startup (${value}) never invents a selection`, async () => {
        await reply(read, value, value === null);
        selected(null); locked(true); status("Unavailable");
        click(next); arrow(); assert(count() === 0, "Unavailable picker accepted input");
      });
    }
    add("rapid clicks and arrows cannot overlap writes or readbacks", async () => {
      await reply(read, initial); click(next); click(initial); arrow();
      // Also cover an already-dispatched event, not just native disabled buttons.
      card(initial).dispatchEvent(new Event("click"));
      assert(count() === 1, "Overlapping write while set pending");
      await reply(write, null); click(initial); arrow();
      card(initial).dispatchEvent(new Event("click"));
      assert(count() === 1, "Overlapping write while readback pending");
      await reply(read, next); selected(next);
      click(initial); await reply(write, null); await reply(read, initial);
      selected(initial); status("Applied"); assert(count() === 2, "Subsequent choice lost");
    });
    add("keyboard focus survives waiting without stealing it after navigation", async () => {
      document.querySelector("#next").click();
      if (kind === "profile") document.querySelector("#next").click();
      await reply(read, initial); card(initial).focus();
      assert(document.activeElement === card(initial), "Initial keyboard focus missing");
      arrow(); assert(document.activeElement === group(), "Focus lost while waiting");
      await reply(write, null); await reply(read, next);
      assert(document.activeElement === card(next), "Focus not restored to confirmed choice");
      arrow(); document.querySelector("#next").click();
      const movedTo = document.activeElement;
      assert(movedTo !== group(), "Navigation failed to move focus");
      await reply(write, null); await reply(read, initial);
      assert(document.activeElement === movedTo, "Late reply stole navigation focus");
    });
  }
  cases.push({ name: "theme and profile operations remain independent", async run() {
    await reply("color_scheme", "dark"); await reply("desktop_profile", "lyra");
    document.querySelector('[data-theme="light"]').click();
    document.querySelector('[data-profile="vanilla"]').click();
    await reply("set_desktop_profile", null); await reply("desktop_profile", "vanilla");
    assert(document.querySelector('[data-theme="dark"]').getAttribute("aria-checked") === "true", "Profile completion changed theme");
    await reply("set_color_scheme", null); await reply("color_scheme", "light");
    assert(document.querySelector('[data-profile="vanilla"]').getAttribute("aria-checked") === "true", "Theme completion changed profile");
  } });
  window.pickerCases = cases;
})();
