import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = process.env.WELCOME_SOURCE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarios = fs.readFileSync(new URL("picker-scenarios.js", import.meta.url), "utf8");

// Minimal DOM adapter for CI without browser dependencies. Real markup supplies
// the cards and initial attributes; the same scenarios also run in WebKitGTK.
function context(locale) {
  const elements = [];
  let document;
  class Element {
    constructor(attributes = {}) {
      this.attrs = attributes;
      this.dataset = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = value;
      }
      this.className = attributes.class || "";
      this.disabled = "disabled" in attributes;
      this.hidden = "hidden" in attributes;
      this.tabIndex = Number(attributes.tabindex || 0);
      this.events = new Map();
      this.textContent = "";
      this.classList = {
        contains: (x) => this.className.split(" ").includes(x),
        toggle: (x, active) => { this.className = [...new Set(this.className.split(" ").filter((y) => y && y !== x).concat(active ? [x] : []))].join(" "); },
      };
    }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    addEventListener(key, fn) { this.events.set(key, fn); }
    dispatchEvent(event) { this.events.get(event.type)?.(event); }
    click() { if (!this.disabled) this.dispatchEvent({ type: "click" }); }
    focus() { if (!this.disabled) document.activeElement = this; }
    querySelector() { return new Element(); }
  }
  for (const tag of fs.readFileSync(path.join(root, "ui/index.html"), "utf8").matchAll(/<[a-z][^>]*>/g)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    for (const flag of ["disabled", "hidden"]) if (new RegExp(`\\s${flag}(?:\\s|>)`).test(tag[0])) attrs[flag] = "";
    elements.push(new Element(attrs));
  }
  document = {
    documentElement: new Element(),
    querySelectorAll(selector) {
      return elements.filter((e) => selector.startsWith(".") ? e.classList.contains(selector.slice(1))
        : selector.startsWith("#") ? e.attrs.id === selector.slice(1)
        : /^\[([^=\]]+)(?:="([^"]*)")?\]$/.test(selector) && (() => {
          const [, key, value] = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
          return key in e.attrs && (value === undefined || e.attrs[key] === value);
        })());
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0]; },
  };
  class Event { constructor(type, attrs = {}) { this.type = type; Object.assign(this, attrs); } preventDefault() {} }
  const ctx = vm.createContext({ window: {}, document, navigator: { language: locale }, setTimeout, Event, KeyboardEvent: Event });
  vm.runInContext(scenarios, ctx);
  for (const name of ["i18n.js", "app.js"]) vm.runInContext(fs.readFileSync(path.join(root, "ui", name), "utf8"), ctx);
  return ctx;
}

for (const locale of ["en-US", "pt-BR", "es-ES"]) {
  const names = context(locale).window.pickerCases.map((item) => item.name);
  names.forEach((name, index) => test(`${locale}: ${name}`, async () => {
    await context(locale).window.pickerCases[index].run();
  }));
}
