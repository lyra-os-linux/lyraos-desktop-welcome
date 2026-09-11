from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WELCOME = ROOT


class WelcomeContractTests(unittest.TestCase):
    def test_obs_vendor_archive_uses_a_relative_cargo_path(self) -> None:
        script = (WELCOME / "packaging/make-obs-sources.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn("cargo vendor --locked", script)
        self.assertIn(
            "sed -i 's|^directory = .*|directory = \"vendor\"|'",
            script,
        )

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

    def test_webkit_compositing_is_disabled_before_tauri_starts(self) -> None:
        rust = (WELCOME / "src-tauri/src/main.rs").read_text(encoding="utf-8")
        disable = rust.index(
            'std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1")'
        )
        builder = rust.index("tauri::Builder::default()")
        self.assertLess(disable, builder)
        self.assertIn("before Tauri or WebKit can", rust)

    def test_page_navigation_is_bounded(self) -> None:
        app = (WELCOME / "ui/app.js").read_text(encoding="utf-8")
        markup = (WELCOME / "ui/index.html").read_text(encoding="utf-8")
        styles = (WELCOME / "ui/spacing.css").read_text(encoding="utf-8")
        self.assertIn("Math.min(current + 1, pages.length - 1)", app)
        self.assertIn("Math.max(current - 1, 0)", app)
        self.assertIn("Math.max(0, Math.min(current, pages.length - 1))", app)
        self.assertIn("[hidden]", styles)
        self.assertIn("display: none !important", styles)
        self.assertEqual(markup.count('tabindex="-1"'), 5)
        self.assertIn('querySelector("h1").focus({ preventScroll: true })', app)

    def test_native_integrations_use_fixed_system_commands(self) -> None:
        rust = (WELCOME / "src-tauri/src/main.rs").read_text(encoding="utf-8")
        spec = (WELCOME / "packaging/lyra-welcome.spec").read_text(
            encoding="utf-8"
        )
        self.assertIn('Command::new("/usr/bin/nmcli")', rust)
        self.assertIn('launch("/usr/bin/gnome-control-center", &["wifi"])', rust)
        self.assertIn('launch("/usr/bin/vega-gtk", &[])', rust)
        for package in ("NetworkManager", "gnome-control-center"):
            self.assertRegex(spec, rf"(?m)^Requires:\s+{re.escape(package)}$")

    def test_setup_pages_are_ordered_theme_profile_network(self) -> None:
        markup = (WELCOME / "ui/index.html").read_text(encoding="utf-8")
        theme = markup.index('data-page="theme"')
        profile = markup.index('data-page="profile"')
        network = markup.index('data-page="network"')
        self.assertLess(theme, profile)
        self.assertLess(profile, network)
        self.assertEqual(markup.count('class="progress-dot'), markup.count("<section class="))
        for value in ("lyra", "vanilla", "ubuntu", "windows10", "windows11", "macos"):
            self.assertIn(f'data-profile="{value}"', markup)

    def test_desktop_profile_reuses_the_versioned_vega_contract(self) -> None:
        rust = (WELCOME / "src-tauri/src/main.rs").read_text()
        profiles = (WELCOME / "src-tauri/src/profiles.rs").read_text()
        spec = (WELCOME / "packaging/lyra-welcome.spec").read_text()
        self.assertIn('"/usr/bin/vega-gtk"', profiles)
        self.assertIn('.arg("--desktop-profile")', profiles)
        self.assertNotIn("enabled-extensions", rust + profiles)
        self.assertNotIn("desktop-profile-settings", rust + profiles)
        self.assertRegex(spec, r"(?m)^Requires:\s+vega-gtk >= 5\.1\.34$")
        self.assertRegex(spec, r"(?m)^Requires:\s+sheliak >= 1\.16\.0$")

    def test_appearance_uses_the_gnome_color_scheme_key(self) -> None:
        rust = (WELCOME / "src-tauri/src/main.rs").read_text(encoding="utf-8")
        app = (WELCOME / "ui/app.js").read_text(encoding="utf-8")
        markup = (WELCOME / "ui/index.html").read_text(encoding="utf-8")
        # Vega's appearance module writes this same schema and key.
        self.assertIn('const INTERFACE_SCHEMA: &str = "org.gnome.desktop.interface"', rust)
        self.assertIn('const COLOR_SCHEME_KEY: &str = "color-scheme"', rust)
        for value in ("prefer-light", "prefer-dark"):
            self.assertIn(f'"{value}"', rust)
        self.assertIn('core.invoke("color_scheme")', app)
        self.assertIn('core.invoke("set_color_scheme", { theme })', app)
        for value in ("light", "dark"):
            self.assertIn(f'data-theme="{value}"', markup)

    def test_the_window_itself_follows_the_chosen_scheme(self) -> None:
        app = (WELCOME / "ui/app.js").read_text(encoding="utf-8")
        styles = (WELCOME / "ui/styles.css").read_text(encoding="utf-8")
        self.assertIn("document.documentElement.dataset.scheme = selected", app)
        self.assertIn(':root[data-scheme="light"]', styles)
        self.assertIn("@media (prefers-color-scheme: light)", styles)
        # The palette must be tokenised, or half the window would stay dark.
        self.assertNotIn("#edf3fa;", styles.split(":root[data-scheme")[1])

    def test_profile_strings_exist_in_every_locale(self) -> None:
        catalog = (WELCOME / "ui/i18n.js").read_text(encoding="utf-8")
        for key in (
            "themeTitle",
            "themeLightTitle",
            "themeDarkTitle",
            "themeApplied",
            "themeFailed",
            "themeUnavailable",
            "profileTitle",
            "profileLyraTitle",
            "profileVanillaTitle",
            "profileUbuntuTitle",
            "profileUbuntuText",
            "profileWindows10Title",
            "profileWindows10Text",
            "profileWindows11Title",
            "profileWindows11Text",
            "profileMacosTitle",
            "profileMacosText",
            "profileApplied",
            "profileFailed",
            "profileUnavailable",
        ):
            self.assertEqual(catalog.count(f"{key}:"), 3, key)

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
