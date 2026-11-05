mod models;
mod server;
mod updates;

use models::AppState;
use server::{is_flask_running, is_port_in_use, kill_port_process, spawn_flask, get_app_dir, cleanup_flask};
use tauri::Manager;
use std::path::PathBuf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置 panic hook 写日志
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {:?}", info);
        log_to_file(&msg);
    }));

    let port = 5008u16;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::PendingUpdate::default())
        .manage(AppState::new(port))
        .invoke_handler(tauri::generate_handler![
            server::start_flask,
            server::restart_flask,
            server::stop_flask,
            server::open_in_browser,
            server::get_status,
            server::kill_port,
            updates::check_for_update,
            updates::install_update,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let port = port;

            // 在 setup 阶段自动启动 Flask（后台线程，不阻塞主线程）
            std::thread::spawn(move || {
                auto_start_flask(&handle, port);
            });

            // 注册 SIGTERM 信号处理器，确保进程被杀时清理端口
            #[cfg(unix)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut sigterm = match signal_hook::consts::SIGTERM {
                        sig => signal_hook::iterator::Signals::new(&[sig]),
                    };
                    if let Ok(ref mut signals) = sigterm {
                        for _sig in signals.forever() {
                            println!("[annotate] Received SIGTERM, cleaning up...");
                            let state = handle.state::<AppState>();
                            cleanup_flask(&state);
                            std::process::exit(0);
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let state = window.state::<AppState>();
                cleanup_flask(&state);
                let app_handle = window.app_handle();
                app_handle.exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                cleanup_flask(&state);
            }
        });
}

/// 写日志到文件（用于 release 模式调试）
pub fn log_to_file(msg: &str) {
    use std::io::Write;
    let log_path = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).join("annotate-debug.log"))
        .unwrap_or_else(|_| std::path::PathBuf::from("annotate-debug.log"));
    
    // 确保日志目录存在
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"), msg);
        let _ = f.flush();
    }
    eprintln!("[annotate] {}", msg);
}

/// 清理 Windows UNC 路径前缀 (\\?\)
pub fn clean_path(p: &PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if s.starts_with(r"\\?\") {
        PathBuf::from(&s[4..])
    } else {
        p.clone()
    }
}

/// 自动启动 Flask：如果已有实例运行则复用，否则启动新进程
fn auto_start_flask(app: &tauri::AppHandle, port: u16) {
    let state = app.state::<AppState>();
    let app_dir = clean_path(&get_app_dir(app));

    log_to_file(&format!("auto_start_flask, app_dir: {:?}", app_dir));

    // 已有 Flask 在运行 → 复用
    if is_flask_running(port) {
        *state.flask_state.lock().unwrap() = models::FlaskState::Running;
        log_to_file(&format!("Flask already running on port {}, reusing", port));
        return;
    }

    // 端口被其他进程占用 → 尝试清理
    if is_port_in_use(port) {
        log_to_file(&format!("Port {} in use by another process, killing...", port));
        if !kill_port_process(port) {
            *state.flask_state.lock().unwrap() = models::FlaskState::Error(
                format!("端口 {} 被占用且无法释放", port)
            );
            return;
        }
    }

    // 启动 Flask 子进程
    match spawn_flask(&app_dir, port) {
        Ok(child) => {
            let pgid = child.id() as i32;
            *state.flask_pgid.lock().unwrap() = Some(pgid);
            *state.flask_process.lock().unwrap() = Some(child);
            *state.flask_state.lock().unwrap() = models::FlaskState::Starting;
            log_to_file(&format!("Flask subprocess started, pgid={}", pgid));
        }
        Err(e) => {
            *state.flask_state.lock().unwrap() = models::FlaskState::Error(e.clone() as String);
            log_to_file(&format!("Flask start failed: {}", e));
        }
    }
}
