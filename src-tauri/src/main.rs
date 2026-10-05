#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::Manager;

mod bridge;
mod commands;
mod db;
mod models;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let state = db::init(&app.handle())?;
            let shared = Arc::new(state);
            app.manage(shared);
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let bridge_state = bridge::Bridge::load(&data_dir)?;
            app.manage(bridge_state);
            // A busy port must not prevent the app from starting; status is
            // surfaced in Settings.
            let _ = bridge::start(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::area_list,
            commands::area_create,
            commands::area_update,
            commands::area_delete,
            commands::goal_list,
            commands::goal_create,
            commands::goal_update,
            commands::goal_delete,
            commands::project_list,
            commands::project_create,
            commands::project_update,
            commands::project_delete,
            commands::task_list,
            commands::task_get,
            commands::task_counts,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::task_set_complete,
            commands::habit_list,
            commands::habit_create,
            commands::habit_update,
            commands::habit_delete,
            commands::habit_entries,
            commands::habit_toggle,
            commands::review_list,
            commands::review_get,
            commands::review_save,
            commands::review_stats,
            commands::note_get,
            commands::note_save,
            commands::search_all,
            commands::app_data_dir,
            bridge::bridge_status,
            bridge::bridge_set_enabled,
            bridge::bridge_set_port,
            bridge::bridge_regen_token,
            bridge::bridge_get_token,
            bridge::bridge_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bizi");
}
