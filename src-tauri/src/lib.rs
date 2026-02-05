mod screen;

use screen::{CaptureConfig, ScreenCapture, ScreenCaptureState};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScreenCaptureState(Mutex::new(ScreenCapture::new(
            CaptureConfig::default(),
        ))))
        .invoke_handler(tauri::generate_handler![
            screen::list_screens,
            screen::capture_screen,
            screen::set_capture_config,
            screen::reset_capture,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
