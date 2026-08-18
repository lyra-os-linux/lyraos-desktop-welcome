from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WELCOME = ROOT / "welcome"


class WelcomeContractTests(unittest.TestCase):
    def test_three_locales_and_english_fallback_are_embedded(self) -> None:
        catalog = (WELCOME / "ui/i18n.js").read_text(encoding="utf-8")
        for locale in ("en-US", "pt-BR", "es-ES"):
            self.assertIn(f'"{locale}"', catalog)
        app = (WELCOME / "ui/app.js").read_text(encoding="utf-8")
        self.assertIn('return "en-US"', app)
        self.assertIn("navigator.language", app)
        self.assertNotIn('querySelector("#language")', app)

    def test_start_button_closes_through_a_native_tauri_command(self) -> None:
        app = (WELCOME / "ui/app.js").read_text(encoding="utf-8")
        rust = (WELCOME / "src-tauri/src/main.rs").read_text(encoding="utf-8")
        self.assertIn('core.invoke("close_welcome")', app)
        self.assertIn("fn close_welcome(window: tauri::WebviewWindow)", rust)
        self.assertIn("window.close()", rust)

    def test_page_navigation_is_bounded(self) -> None:
        app = (WELCOME / "ui/app.js").read_text(encoding="utf-8")
        markup = (WELCOME / "ui/index.html").read_text(encoding="utf-8")
        styles = (WELCOME / "ui/spacing.css").read_text(encoding="utf-8")
        self.assertIn("Math.min(current + 1, pages.length - 1)", app)
        self.assertIn("Math.max(current - 1, 0)", app)
        self.assertIn("Math.max(0, Math.min(current, pages.length - 1))", app)
        self.assertIn("[hidden]", styles)
        self.assertIn("display: none !important", styles)
        self.assertEqual(markup.count('tabindex="-1"'), 3)
        self.assertIn('querySelector("h1").focus({ preventScroll: true })', app)

    def test_native_integrations_use_fixed_system_commands(self) -> None:
        rust = (WELCOME / "src-tauri/src/main.rs").read_text(encoding="utf-8")
        spec = (WELCOME / "packaging/lyra-welcome.spec").read_text(
            encoding="utf-8"
        )
        self.assertIn('Command::new("/usr/bin/nmcli")', rust)
        self.assertIn('launch("/usr/bin/gnome-control-center", &["wifi"])', rust)
        self.assertIn('launch("/usr/bin/vega-gtk", &[])', rust)
        for package in ("NetworkManager", "gnome-control-center", "vega-gtk"):
            self.assertRegex(spec, rf"(?m)^Requires:\s+{re.escape(package)}$")

    def test_first_login_launcher_is_fail_closed_and_per_user(self) -> None:
        launcher = WELCOME / "packaging/lyra-welcome-first-login"
        content = launcher.read_text(encoding="utf-8")
        self.assertIn("XDG_STATE_HOME", content)
        self.assertIn("welcome-completed", content)
        self.assertIn("liveuser", content)
        self.assertRegex(content, re.compile(r"if /usr/bin/lyra-welcome; then"))
        marker_write = content.index("printf 'completed")
        app_run = content.index("if /usr/bin/lyra-welcome; then")
        self.assertGreater(marker_write, app_run)
        result = subprocess.run(
            ["bash", "-n", str(launcher)], capture_output=True, text=True, check=False
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_autostart_uses_the_guarded_launcher(self) -> None:
        autostart = (
            WELCOME / "packaging/org.lyraos.LyraWelcome-autostart.desktop"
        ).read_text(encoding="utf-8")
        self.assertIn("TryExec=/usr/bin/lyra-welcome", autostart)
        self.assertIn("Exec=/usr/bin/lyra-welcome-first-login", autostart)
        self.assertIn("OnlyShowIn=GNOME;", autostart)
        self.assertNotIn("pkexec", autostart)


if __name__ == "__main__":
    unittest.main()
