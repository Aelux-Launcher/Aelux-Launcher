//! 应用入口库：specta 绑定导出 + 插件注册 + 内核链路初始化。

mod commands;
mod core_api;
mod dialog;
mod dto;
mod updater;

use tauri_specta::{collect_commands, Builder};

/// specta 构建器：命令清单 + TS 绑定导出（run 与测试共用同一份）。
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        dialog::save_file_dialog,
        dialog::pick_file_dialog,
        commands::get_data_dir,
        commands::detect_official_minecraft,
        commands::get_os_info,
        commands::list_logs,
        commands::read_crash_report,
        commands::get_core_version,
        commands::fetch_json,
        commands::curseforge_fetch,
        commands::download_file,
        commands::fetch_minecraft_manifest,
        commands::loader_versions,
        commands::mod_api_versions,
        commands::auth_start_device_flow,
        commands::auth_poll_device_flow,
        commands::auth_logout,
        commands::accounts_list,
        commands::accounts_upsert,
        commands::accounts_remove,
        commands::account_session_get,
        commands::account_session_set,
        commands::account_login_offline,
        commands::auth_servers_list,
        commands::auth_server_add,
        commands::auth_server_remove,
        commands::get_instances,
        commands::create_instance,
        commands::delete_instance,
        commands::kv_get,
        commands::kv_set,
        commands::kv_remove,
        commands::get_config,
        commands::save_config,
        commands::cache_dir,
        commands::clear_cache,
        commands::set_window_icon,
        commands::scan_java,
        commands::required_java,
        commands::get_instance_dir,
        commands::list_content,
        commands::set_content_enabled,
        commands::delete_content,
        commands::import_content,
        commands::install_version,
        commands::install_instance,
        commands::set_instance_loader,
        commands::cancel_download,
        commands::launch_instance,
        commands::kill_instance,
        commands::cancel_launch,
        commands::running_instances,
        commands::export_launch_script,
        commands::backup_world,
        commands::authlib_login,
        commands::authlib_refresh,
        commands::refresh_microsoft_account,
        commands::install_resource,
        commands::check_mod_updates,
        commands::install_mod_api,
        commands::export_modpack,
        commands::import_modpack,
        commands::import_modpack_url,
        commands::install_java,
        commands::probe_java,
        commands::read_text,
        commands::delete_path,
        commands::rename_path,
        commands::minimize_window,
        commands::close_window,
        commands::toggle_maximize_window,
        commands::set_fullscreen_window,
        commands::window_state,
        commands::open_external,
        commands::open_folder_in_explorer,
        commands::write_text,
        commands::read_bundled_announcements,
        commands::update_check,
        commands::update_download,
        commands::update_apply_restart,
        commands::update_status,
    ])
}

pub fn run() {
    // 无痕更新第一步：完成上次会话遗留的换身 / 应用暂存更新 / 清理 `.old`。
    // 必须在窗口与内核初始化之前执行——此时内核 dll 尚未加载，文件未被锁。
    updater::boot_swap_or_cleanup();

    let builder = specta_builder();

    // 调试构建导出 TS 绑定；文件纳入 git，CI diff 非空即 IPC schema 漂移
    #[cfg(debug_assertions)]
    {
        use specta_typescript::Typescript;
        builder
            .export(Typescript::default(), "../src/lib/bindings.ts")
            .expect("导出 TS 绑定失败");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            commands::set_app_handle(app.handle().clone());

            // 窗口形态：不透明铺满 + 系统圆角（Win11 DWM）+ 系统阴影（tao undecorated
            // shadow，conf 里 shadow:true）。不关系统圆角——圆角由 DWM 裁剪，
            // 与内容边缘重合，无空气边；Win10 无 DWM 圆角则呈现方角。
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                // 窗口尺寸固定 960×580：默认 = 最小，
                // 想要更大由用户手动拖大；不做屏幕自适应放大。
                let _ = win.set_min_size(Some(tauri::LogicalSize::new(960.0, 580.0)));
                // 双保险：conf 的 center:true 之外显式居中一次
                let _ = win.center();

                commands::init_window_tracking(&win);

                // 可调试便捷包（--features debug-tools）：release 构建也启用
                // WebView2 DevTools，启动即自动展开，右键「检查」/ F12 均可用。
                #[cfg(feature = "debug-tools")]
                win.open_devtools();

                let handle = win.clone();
                win.on_window_event(move |event| {
                    // 「贴顶最大化 → 还原」时 WebView2 可能停留在最大化尺寸或不再
                    // 重绘，表现为窗口不可见；统一交给窗口命令层处理。
                    if matches!(event, tauri::WindowEvent::Resized(_)) {
                        commands::on_window_resized(&handle);
                    }
                    // TEMP-DIAG: 窗口关闭诊断（验证完删除）
                    if matches!(
                        event,
                        tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
                    ) {
                        eprintln!("[diag] window event: {event:?}");
                    }
                });
            }

            core_api::init(&app.handle().clone());
            // TEMP-DIAG: Rust 侧直触发对话框链路（验证完删除）
            {
                let h = app.handle().clone();
                std::thread::spawn(move || {
                    let log = |msg: &str| {
                        use std::io::Write;
                        if let Ok(mut f) = std::fs::OpenOptions::new()
                            .create(true)
                            .append(true)
                            .open("D:/TXX/AppData/aelux-diag.log")
                        {
                            let _ = writeln!(f, "{msg}");
                        }
                    };
                    log("diag: thread started, sleep 5s");
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    log("diag: firing rust-side dialog");
                    let win = h.get_webview_window("main");
                    let out = tauri::async_runtime::block_on(dialog::save_file_dialog(
                        win.expect("no main window"),
                        dialog::SaveDialogOptions {
                            title: Some("RUST-SIDE-PROBE".into()),
                            default_path: Some("rust-side-probe.jar".into()),
                            filters: None,
                        },
                    ));
                    log(&format!("diag: rust-side dialog returned: {out:?}"));
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Aelux Launcher 运行失败");
}

/// CI 绑定漂移检查：重新导出 bindings.ts，diff 非空即失败。
/// 仅在 Linux CI 上跑（Windows 下链接 tauri 的测试二进制存在系统清单问题，
/// 本地 Windows 由 `cargo tauri dev` 的 debug 启动钩子导出）。
#[cfg(all(debug_assertions, not(target_os = "windows")))]
#[test]
fn export_bindings() {
    use specta_typescript::Typescript;
    specta_builder()
        .export(Typescript::default(), "../src/lib/bindings.ts")
        .expect("导出 TS 绑定失败");
}
