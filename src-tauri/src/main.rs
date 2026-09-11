#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};

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

mod profiles;

#[tauri::command]
async fn desktop_profile() -> String {
    tauri::async_runtime::spawn_blocking(profiles::current)
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_else(|| "unavailable".into())
}

#[tauri::command]
async fn set_desktop_profile(profile: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || profiles::apply(&profile))
        .await
        .map_err(|error| error.to_string())?
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
    // WebKitGTK's accelerated compositing path can abort while probing the
    // virtio/software EGL stack used by the installer VM. Welcome is a small,
    // static setup view, so software compositing is the reliable choice here.
    //
    // SAFETY: this is the first operation in main, before Tauri or WebKit can
    // create worker threads or read the process environment.
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

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
