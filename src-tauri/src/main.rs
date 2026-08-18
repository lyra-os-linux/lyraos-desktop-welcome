#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};

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
            open_wifi_settings,
            open_vega,
            close_welcome
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Lyra Welcome");
}
