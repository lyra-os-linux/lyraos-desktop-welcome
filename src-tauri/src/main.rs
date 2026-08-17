#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn close_welcome(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![close_welcome])
        .run(tauri::generate_context!())
        .expect("failed to run Lyra Welcome");
}
