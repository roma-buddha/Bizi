#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

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
            app.manage(state);
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bizi");
}
