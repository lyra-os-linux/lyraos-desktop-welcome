#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Command, Stdio};

/// The GNOME Shell extension that carries Lyra's dock and panel menus. Vega's
/// "Perfil da área de trabalho" (vega-gtk/src/ui/screen.rs) switches profiles by
/// toggling exactly this UUID in enabled-extensions, leaving every other
/// extension - notably updates-indicator@lyraos.org, enabled by the image
/// default - untouched. The welcome screen must behave identically, or the two
/// places would disagree about what profile the desktop is on.
const SHELIAK_UUID: &str = "sheliak@lyraos.org";
const SHELL_SCHEMA: &str = "org.gnome.shell";
const EXTENSIONS_KEY: &str = "enabled-extensions";

/// The same key Vega's appearance module writes (vega-gtk/src/appearance.rs)
/// and the same one GNOME Settings' Appearance panel uses, so all three agree.
/// Only color-scheme is set here: lyra-os-theme's 99-lyra-os.gschema.override
/// already ships the icon theme and both picture-uri and picture-uri-dark
/// wallpapers, so GNOME swaps the wallpaper on its own when this changes.
const INTERFACE_SCHEMA: &str = "org.gnome.desktop.interface";
const COLOR_SCHEME_KEY: &str = "color-scheme";

#[tauri::command]
fn network_status() -> String {
    let output = Command::new("/usr/bin/nmcli")
        .args(["-t", "-f", "CONNECTIVITY", "general"])
        .stdin(Stdio::null())
        .output();

    match output {
        Ok(result) if result.status.success() => {
            match String::from_utf8_lossy(&result.stdout).trim() {
                "full" | "limited" => "connected".to_owned(),
                "none" => "offline".to_owned(),
                _ => "unknown".to_owned(),
            }
        }
        _ => "unknown".to_owned(),
    }
}

/// gsettings prints a GVariant array of UUIDs: ['a@x', 'b@y'], or "@as []" for
/// an empty one. Extension UUIDs never contain quotes or commas, so splitting
/// on the quoted items is enough - no GVariant parser needed for this key.
fn parse_extension_list(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let inner = trimmed
        .strip_prefix("@as ")
        .unwrap_or(trimmed)
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']');
    inner
        .split(',')
        .map(|item| item.trim().trim_matches('\'').trim_matches('"').to_owned())
        .filter(|item| !item.is_empty())
        .collect()
}

fn format_extension_list(uuids: &[String]) -> String {
    let items = uuids
        .iter()
        .map(|uuid| format!("'{uuid}'"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("[{items}]")
}

fn gsettings(arguments: &[&str]) -> Option<String> {
    let output = Command::new("/usr/bin/gsettings")
        .args(arguments)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// Same search order as Vega's dock::extension_dir, so both agree on whether
/// the Lyra profile can be offered at all.
fn sheliak_installed() -> bool {
    let mut candidates = vec![
        PathBuf::from(std::env::var_os("XDG_DATA_HOME").unwrap_or_else(|| {
            let mut home = std::env::var_os("HOME").unwrap_or_default();
            home.push("/.local/share");
            home
        }))
        .join("gnome-shell/extensions")
        .join(SHELIAK_UUID),
    ];
    for base in ["/usr/share", "/usr/local/share"] {
        candidates.push(
            PathBuf::from(base)
                .join("gnome-shell/extensions")
                .join(SHELIAK_UUID),
        );
    }
    candidates.iter().any(|path| path.is_dir())
}

/// "light" | "dark" | "unavailable".
#[tauri::command]
fn color_scheme() -> String {
    match gsettings(&["get", INTERFACE_SCHEMA, COLOR_SCHEME_KEY]) {
        Some(value) => match value.trim().trim_matches('\'').trim_matches('"') {
            "prefer-dark" => "dark".to_owned(),
            // "default" means the user expressed no preference, which GNOME
            // renders light; the light card is the honest match for it.
            _ => "light".to_owned(),
        },
        None => "unavailable".to_owned(),
    }
}

#[tauri::command]
fn set_color_scheme(theme: String) -> Result<(), String> {
    let value = match theme.as_str() {
        "light" => "prefer-light",
        "dark" => "prefer-dark",
        other => return Err(format!("unknown color scheme: {other}")),
    };
    gsettings(&["set", INTERFACE_SCHEMA, COLOR_SCHEME_KEY, value])
        .map(|_| ())
        .ok_or_else(|| "the appearance could not be changed".to_owned())
}

/// "lyra" | "vanilla" | "unavailable". The last one means the extension is not
/// installed, so only the vanilla profile is truthfully on offer.
#[tauri::command]
fn desktop_profile() -> String {
    if !sheliak_installed() {
        return "unavailable".to_owned();
    }
    match gsettings(&["get", SHELL_SCHEMA, EXTENSIONS_KEY]) {
        Some(value) if parse_extension_list(&value).iter().any(|uuid| uuid == SHELIAK_UUID) => {
            "lyra".to_owned()
        }
        Some(_) => "vanilla".to_owned(),
        None => "unavailable".to_owned(),
    }
}

#[tauri::command]
fn set_desktop_profile(profile: String) -> Result<(), String> {
    let lyra = match profile.as_str() {
        "lyra" => true,
        "vanilla" => false,
        other => return Err(format!("unknown desktop profile: {other}")),
    };
    if lyra && !sheliak_installed() {
        return Err("the Sheliak extension is not installed".to_owned());
    }

    let current = gsettings(&["get", SHELL_SCHEMA, EXTENSIONS_KEY])
        .ok_or_else(|| "GNOME extension settings are unavailable".to_owned())?;
    let mut uuids = parse_extension_list(&current);
    uuids.retain(|uuid| uuid != SHELIAK_UUID);
    if lyra {
        uuids.push(SHELIAK_UUID.to_owned());
    }

    gsettings(&["set", SHELL_SCHEMA, EXTENSIONS_KEY, &format_extension_list(&uuids)])
        .map(|_| ())
        .ok_or_else(|| "the desktop profile could not be changed".to_owned())
}

fn launch(program: &str, arguments: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_wifi_settings() -> Result<(), String> {
    launch("/usr/bin/gnome-control-center", &["wifi"])
}

#[tauri::command]
fn open_vega() -> Result<(), String> {
    launch("/usr/bin/vega-gtk", &[])
}

#[tauri::command]
fn close_welcome(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            network_status,
            color_scheme,
            set_color_scheme,
            desktop_profile,
            set_desktop_profile,
            open_wifi_settings,
            open_vega,
            close_welcome
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Lyra Welcome");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_gsettings_array_of_uuids() {
        assert_eq!(
            parse_extension_list("['sheliak@lyraos.org', 'updates-indicator@lyraos.org']"),
            vec![
                "sheliak@lyraos.org".to_owned(),
                "updates-indicator@lyraos.org".to_owned()
            ]
        );
    }

    #[test]
    fn parses_both_spellings_of_an_empty_list() {
        assert!(parse_extension_list("@as []").is_empty());
        assert!(parse_extension_list("[]").is_empty());
    }

    #[test]
    fn formats_a_list_gsettings_accepts_back() {
        let uuids = vec!["a@x".to_owned(), "b@y".to_owned()];
        assert_eq!(format_extension_list(&uuids), "['a@x', 'b@y']");
        assert_eq!(format_extension_list(&[]), "[]");
        assert_eq!(parse_extension_list(&format_extension_list(&uuids)), uuids);
    }

    /// The vanilla profile must remove Sheliak and nothing else: the image
    /// default also enables updates-indicator, and Vega leaves it alone.
    #[test]
    fn switching_profiles_only_touches_sheliak() {
        let mut uuids = parse_extension_list("['sheliak@lyraos.org', 'updates-indicator@lyraos.org']");
        uuids.retain(|uuid| uuid != SHELIAK_UUID);
        assert_eq!(uuids, vec!["updates-indicator@lyraos.org".to_owned()]);
        uuids.push(SHELIAK_UUID.to_owned());
        assert_eq!(uuids.len(), 2);
    }
}
