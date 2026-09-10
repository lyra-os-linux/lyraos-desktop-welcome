#!/usr/bin/env python3
"""Run the shared UI scenarios in WebKitGTK on an isolated Mutter/session bus.

Requires Python GI, GTK3, WebKit2 4.1, Mutter and dbus-run-session. Tauri IPC is
simulated; this deliberately never reads or changes the user's GNOME settings.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=HERE.parent)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--session", action="store_true", help=argparse.SUPPRESS)
parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
args = parser.parse_args()
args.source = args.source.resolve()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=True)

if not args.session and not args.worker:
    with tempfile.TemporaryDirectory(prefix="welcome-picker-") as temporary:
        env = dict(os.environ, XDG_RUNTIME_DIR=temporary, WAYLAND_DISPLAY="welcome-tests",
                   XDG_CONFIG_HOME=f"{temporary}/config", XDG_CACHE_HOME=f"{temporary}/cache",
                   XDG_DATA_HOME=f"{temporary}/data", GDK_BACKEND="wayland",
                   GIO_USE_VFS="local", LIBGL_ALWAYS_SOFTWARE="1",
                   WEBKIT_DISABLE_COMPOSITING_MODE="1", NO_AT_BRIDGE="1")
        for key in ("DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "DBUS_STARTER_ADDRESS", "DBUS_STARTER_BUS_TYPE"):
            env.pop(key, None)
        result = subprocess.run(["dbus-run-session", "--", sys.executable, __file__,
                                 "--source", str(args.source), "--output", str(args.output),
                                 "--session"], env=env, timeout=180)
        sys.exit(result.returncode)

if args.session:
    with (args.output / "mutter.log").open("w") as log:
        compositor = subprocess.Popen(["mutter", "--headless", "--wayland", "--no-x11",
                                       "--virtual-monitor", "1280x800", "--wayland-display",
                                       os.environ["WAYLAND_DISPLAY"]], stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if (Path(os.environ["XDG_RUNTIME_DIR"]) / os.environ["WAYLAND_DISPLAY"]).exists():
                    break
                if compositor.poll() is not None:
                    raise RuntimeError("Mutter exited; see mutter.log")
                time.sleep(.1)
            else:
                raise RuntimeError("Mutter startup timed out")
            result = subprocess.run([sys.executable, __file__, "--source", str(args.source),
                                     "--output", str(args.output), "--worker"], timeout=150)
        finally:
            compositor.terminate()
            try:
                compositor.wait(timeout=10)
            except subprocess.TimeoutExpired:
                compositor.kill()
                compositor.wait()
        sys.exit(result.returncode)

import gi
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2

results = []
index = 0
locale_index = 0
locales = ["en-US", "pt-BR", "es-ES"]
manager = WebKit2.UserContentManager()
manager.register_script_message_handler("result")
view = WebKit2.WebView(user_content_manager=manager)
window = Gtk.Window()
window.set_default_size(1280, 800)
window.add(view)
window.show_all()

def load_case():
    manager.remove_all_scripts()
    source = "Object.defineProperty(navigator, 'language', {value: " + json.dumps(locales[locale_index]) + "});\n"
    source += (HERE / "picker-scenarios.js").read_text()
    source += "\ndocument.addEventListener('DOMContentLoaded', async () => {\n"
    source += f"const item = window.pickerCases[{index}];\n"
    source += "let error = null; try { await item.run(); } catch (e) { error = e.stack || String(e); }\n"
    source += "window.webkit.messageHandlers.result.postMessage(JSON.stringify({name:item.name, error, locale:document.documentElement.lang, total:window.pickerCases.length}));\n});"
    manager.add_script(WebKit2.UserScript.new(source, WebKit2.UserContentInjectedFrames.TOP_FRAME,
                                             WebKit2.UserScriptInjectionTime.START, None, None))
    view.load_uri((args.source / "ui/index.html").as_uri() + f"?case={index}&locale={locale_index}")
    return GLib.SOURCE_REMOVE

def receive(_manager, value):
    global index, locale_index
    result = json.loads(value.get_js_value().to_string())
    if result["locale"] != locales[locale_index]:
        result["error"] = "Unexpected document locale: " + result["locale"]
    results.append(result)
    print(("FAIL" if result["error"] else "PASS") + f": {result['locale']} {result['name']}", flush=True)
    index += 1
    if index == result["total"]:
        index = 0
        locale_index += 1
    if locale_index == len(locales):
        Gtk.main_quit()
    else:
        GLib.idle_add(load_case)

def timed_out():
    results.append({"error": "WebKit scenarios timed out"})
    Gtk.main_quit()
    return GLib.SOURCE_REMOVE

manager.connect("script-message-received::result", receive)
GLib.timeout_add_seconds(120, timed_out)
load_case()
Gtk.main()
window.destroy()
report = {"engine": f"WebKitGTK {WebKit2.get_major_version()}.{WebKit2.get_minor_version()}.{WebKit2.get_micro_version()}",
          "source": str(args.source), "results": results,
          "passed": sum(not result["error"] for result in results),
          "failed": sum(bool(result["error"]) for result in results)}
(args.output / "result.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({key: report[key] for key in ("engine", "passed", "failed")}), flush=True)
sys.exit(bool(report["failed"]))
