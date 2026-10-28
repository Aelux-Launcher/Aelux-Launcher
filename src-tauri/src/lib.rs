mod commands;
mod ext_commands;

use commands::LauncherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(std::sync::Mutex::new(LauncherState::default()))
        .invoke_handler(tauri::generate_handler![
            // 来自原型的能力层
            commands::ping,
            commands::get_versions,
            commands::get_instances,
            commands::create_instance,
            commands::delete_instance,
            commands::launch_minecraft,
            commands::login_offline,
            commands::get_settings,
            commands::save_settings,
            commands::minimize_window,
            commands::toggle_maximize,
            commands::close_window,
            commands::detect_official_launcher,
            commands::get_mc_versions,
            commands::add_folder,
            commands::create_tag,
            commands::delete_tag,
            commands::get_tags,
            commands::open_folder_in_explorer,
            commands::select_folder,
            // lib-platform 桥接所需
            ext_commands::kv_get,
            ext_commands::kv_set,
            ext_commands::kv_remove,
            ext_commands::open_external,
            ext_commands::download_file,
            ext_commands::apply_update,
            ext_commands::inject_fixmod,
            ext_commands::remove_fixmod,
            ext_commands::report_telemetry,
            ext_commands::read_bundled_announcements,
            ext_commands::read_local_update,
            ext_commands::read_text,
            ext_commands::write_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
