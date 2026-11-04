//! 应用入口库：specta 绑定导出 + 插件注册 + 内核链路初始化。

mod commands;
mod core_api;
mod dto;

use tauri_specta::{collect_commands, Builder};

/// specta 构建器：命令清单 + TS 绑定导出（run 与测试共用同一份）。
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::get_data_dir,
        commands::get_os_info,
        commands::get_core_version,
        commands::fetch_json,
        commands::download_file,
        commands::fetch_minecraft_manifest,
        commands::get_instances,
        commands::create_instance,
        commands::delete_instance,
        commands::kv_get,
        commands::kv_set,
        commands::kv_remove,
        commands::get_config,
        commands::save_config,
        commands::minimize_window,
        commands::close_window,
        commands::open_external,
        commands::open_folder_in_explorer,
        commands::write_text,
        commands::read_bundled_announcements,
        commands::read_local_update,
    ])
}

pub fn run() {
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            // Windows：关闭 Win11 系统圆角。透明无边框窗口被 DWM 强制裁圆角时，
            // 四角会露出系统裁剪的缝隙；圆角改由前端容器自绘（.aelux-app）。
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(win) = app.get_webview_window("main") {
                    disable_system_rounded_corners(&win);
                }
            }

            core_api::init(&app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Aelux Launcher 运行失败");
}

/// 关闭 Win11 系统圆角（DWMWA_WINDOW_CORNER_PREFERENCE → DONOTROUND）。
/// 当前 tauri/tao 版本未暴露该能力，直接走 DWM API。
#[cfg(target_os = "windows")]
fn disable_system_rounded_corners(win: &tauri::WebviewWindow) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
    };
    if let Ok(hwnd) = win.hwnd() {
        let pref = DWMWCP_DONOTROUND; // i32（DWM_WINDOW_CORNER_PREFERENCE）
        unsafe {
            DwmSetWindowAttribute(
                hwnd.0 as _,
                DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                &pref as *const i32 as *const core::ffi::c_void,
                4,
            );
        }
    }
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
