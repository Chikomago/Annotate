use crate::models::{AppState, FlaskState};
use std::path::PathBuf;
use std::process::Command;
use tauri::{Manager, State};

/// 检查端口是否被占用
pub fn is_port_in_use(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

/// 检查端口上运行的是否是 Annotate Flask 服务
pub fn is_flask_running(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{}/api/health", port);
    if let Ok(resp) = ureq::get(&url).timeout(std::time::Duration::from_secs(2)).call() {
        return resp.status() == 200;
    }
    false
}

/// 杀掉占用端口的进程
pub fn kill_port_process(port: u16) -> bool {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for pid in stdout.trim().split('\n').filter(|s| !s.is_empty()) {
                if let Ok(pid_num) = pid.trim().parse::<i32>() {
                    unsafe {
                        libc::kill(pid_num, libc::SIGKILL);
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
            return !is_port_in_use(port);
        }
    }

    #[cfg(windows)]
    {
        // 尝试多种方法清理端口
        // 方法1: 使用netstat查找进程
        let output = Command::new("cmd")
            .args(["/C", &format!("netstat -ano | findstr :{}", port)])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            for line in stdout.lines() {
                if line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        if !pid.is_empty() {
                            println!("[annotate] Killing process {} on port {}", pid, port);
                            let result = Command::new("taskkill")
                                .args(["/F", "/PID", pid])
                                .output();
                            if let Ok(output) = result {
                                if !output.status.success() {
                                    let stderr = String::from_utf8_lossy(&output.stderr);
                                    println!("[annotate] Failed to kill PID {}: {}", pid, stderr);
                                }
                            }
                        }
                    }
                }
            }
            
            std::thread::sleep(std::time::Duration::from_millis(500));
            
            // 如果端口仍然被占用，尝试方法2: 使用PowerShell
            if is_port_in_use(port) {
                println!("[annotate] Port still in use, trying PowerShell method...");
                let ps_command = format!("Get-Process -Id (Get-NetTCPConnection -LocalPort {}).OwningProcess | Stop-Process -Force", port);
                let result = Command::new("powershell")
                    .args(["-Command", &ps_command])
                    .output();
                if let Ok(output) = result {
                    if output.status.success() {
                        println!("[annotate] PowerShell kill successful");
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        println!("[annotate] PowerShell kill failed: {}", stderr);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            
            return !is_port_in_use(port);
        }
    }

    false
}

/// 查找 Python 可执行文件路径
pub fn find_python(app_dir: &PathBuf) -> Option<PathBuf> {
    // 1. 打包环境：resources/python/ 下的 Python
    #[cfg(unix)]
    {
        for name in &["python3", "python"] {
            let p = app_dir.join("python").join("bin").join(name);
            if p.exists() {
                println!("[annotate] Found python (bundled): {:?}", p);
                crate::log_to_file(&format!("Found python (bundled): {:?}", p));
                return Some(p);
            }
        }
    }
    #[cfg(windows)]
    {
        // 尝试多种Windows Python路径
        let paths = vec![
            app_dir.join("python").join("Scripts").join("python.exe"),
            app_dir.join("python").join("python.exe"),
            app_dir.join("python").join("bin").join("python.exe"),
        ];
        
        for p in paths {
            if p.exists() {
                println!("[annotate] Found python (bundled): {:?}", p);
                crate::log_to_file(&format!("Found python (bundled): {:?}", p));
                return Some(p);
            }
        }
    }

    // 2. 开发环境：项目根目录下的 venv-tauri
    #[cfg(unix)]
    {
        for parent in &[app_dir.as_path(), app_dir.join("..").as_path()] {
            let venv = parent.join("venv-tauri").join("bin").join("python3");
            if venv.exists() {
                println!("[annotate] Found python (venv-tauri): {:?}", venv);
                return Some(venv);
            }
        }
    }
    #[cfg(windows)]
    {
        for parent in &[app_dir.as_path(), app_dir.join("..").as_path()] {
            let venv = parent.join("venv-tauri").join("Scripts").join("python.exe");
            if venv.exists() {
                println!("[annotate] Found python (venv-tauri): {:?}", venv);
                return Some(venv);
            }
        }
    }

    // 3. 系统 Python
    #[cfg(unix)]
    {
        for p in &["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"] {
            if PathBuf::from(p).exists() {
                println!("[annotate] Found python (system): {}", p);
                return Some(PathBuf::from(p));
            }
        }
    }
    #[cfg(windows)]
    {
        // Windows: 尝试常见路径和 PATH
        // 先尝试直接调用python
        if let Ok(output) = Command::new("python").arg("--version").output() {
            if output.status.success() {
                // 如果python命令可用，返回它的路径
                if let Ok(output) = Command::new("where").arg("python").output() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if let Some(first) = stdout.lines().next() {
                        let p = PathBuf::from(first.trim());
                        if p.exists() {
                            println!("[annotate] Found python (system): {:?}", p);
                            return Some(p);
                        }
                    }
                }
            }
        }
        // 尝试python3
        if let Ok(output) = Command::new("python3").arg("--version").output() {
            if output.status.success() {
                if let Ok(output) = Command::new("where").arg("python3").output() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if let Some(first) = stdout.lines().next() {
                        let p = PathBuf::from(first.trim());
                        if p.exists() {
                            println!("[annotate] Found python3 (system): {:?}", p);
                            return Some(p);
                        }
                    }
                }
            }
        }
    }

    println!("[annotate] Python not found, searched in: {:?}", app_dir);
    crate::log_to_file(&format!("Python not found, searched in: {:?}", app_dir));
    None
}

/// 查找 app.py 路径
/// 打包后: resources/app/app.py
/// 开发环境: 项目根/app.py
pub fn find_app_py(app_dir: &PathBuf) -> Option<PathBuf> {
    // 打包环境：resources/app/app.py
    let p = app_dir.join("app").join("app.py");
    if p.exists() {
        println!("[annotate] Found app.py (bundled): {:?}", p);
        return Some(p);
    }

    // 直接在资源目录下
    let p = app_dir.join("app.py");
    if p.exists() {
        println!("[annotate] Found app.py: {:?}", p);
        return Some(p);
    }

    // 开发环境：上级目录
    let p = app_dir.join("..").join("app.py");
    if let Ok(canon) = p.canonicalize() {
        if canon.exists() {
            println!("[annotate] Found app.py (parent): {:?}", canon);
            return Some(canon);
        }
    }

    println!("[annotate] app.py not found, searched in: {:?}", app_dir);
    None
}

/// 启动 Flask 子进程
pub fn spawn_flask(app_dir: &PathBuf, port: u16) -> Result<std::process::Child, String> {
    let python = find_python(app_dir).ok_or("未找到 Python 可执行文件")?;
    let app_py = find_app_py(app_dir).ok_or("未找到 app.py")?;

    let python = crate::clean_path(&python);
    let app_py = crate::clean_path(&app_py);
    let app_py_dir = crate::clean_path(&app_py.parent().unwrap_or(app_dir).to_path_buf());

    crate::log_to_file(&format!("Spawning Flask: python={:?}, app_py={:?}", python, app_py));
    crate::log_to_file(&format!("Working directory: {:?}", app_py_dir));

    // 获取当前进程 PID，让 Python 监控父进程
    let parent_pid = std::process::id().to_string();

    let mut cmd = Command::new(&python);
    cmd.arg(&app_py)
        .env("ANNOTATE_PORT", port.to_string())
        .env("ANNOTATE_PARENT_PID", &parent_pid)
        .env("ANNOTATE_NO_AUTO_OPEN", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")  // Windows 输出编码设为 UTF-8
        .env("PYTHONUTF8", "1")  // 启用 Python UTF-8 模式
        .env("PYTHONPATH", &app_py_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(&app_py_dir);

    // 设置子进程为新进程组，方便退出时杀整个组
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    // Windows 特定处理：隐藏控制台窗口
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (0x08000000) - 不创建控制台窗口
        cmd.creation_flags(0x08000000);
        println!("[annotate] Windows spawn: parent PID = {}", parent_pid);
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let pid = child.id();
            crate::log_to_file(&format!("Flask spawned successfully, PID: {}", pid));
            
            // 异步读取子进程输出，防止缓冲区满导致子进程阻塞
            let child_stdout = child.stdout.take();
            let child_stderr = child.stderr.take();
            
            std::thread::spawn(move || {
                // 读取 stdout
                if let Some(stdout) = child_stdout {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().map_while(Result::ok) {
                        let msg = format!("[Flask stdout] {}", line);
                        crate::log_to_file(&msg);
                    }
                }
            });
            
            std::thread::spawn(move || {
                // 读取 stderr
                if let Some(stderr) = child_stderr {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().map_while(Result::ok) {
                        let msg = format!("[Flask stderr] {}", line);
                        crate::log_to_file(&msg);
                    }
                }
            });
            
            println!("[annotate] Flask spawned successfully, PID: {}", pid);
            Ok(child)
        }
        Err(e) => {
            let msg = format!("Flask spawn failed: {}", e);
            crate::log_to_file(&msg);
            eprintln!("[annotate] {}", msg);
            Err(msg)
        }
    }
}

/// 获取应用资源目录
/// 打包后: Annotate.app/Contents/Resources/resources/  (包含 python/ 和 app/)
/// 开发时: 项目根目录 (包含 app.py)
pub fn get_app_dir(app: &tauri::AppHandle) -> PathBuf {
    crate::log_to_file("=== get_app_dir called ===");
    
    if let Ok(dir) = app.path().resource_dir() {
        crate::log_to_file(&format!("[get_app_dir] resource_dir: {:?}", dir));
        
        // 打包环境：resource_dir() 返回 Contents/Resources
        // 我们的资源在 resources/ 子目录下
        let resources_dir = dir.join("resources");
        if resources_dir.join("python").exists() || resources_dir.join("app").exists() {
            crate::log_to_file(&format!("[get_app_dir] Using bundled resources: {:?}", resources_dir));
            println!("[annotate] Using bundled resources: {:?}", resources_dir);
            return resources_dir;
        }

        // 打包环境：资源直接放在 Contents/Resources/ 下
        if dir.join("python").exists() || dir.join("app").exists() {
            crate::log_to_file(&format!("[get_app_dir] Using resource_dir directly: {:?}", dir));
            println!("[annotate] Using resource_dir directly: {:?}", dir);
            return dir;
        }

        // Windows: 检查是否在 resources/python/ 下运行
        let dir_str = dir.to_string_lossy().to_lowercase();
        if dir_str.contains("resources") && dir_str.contains("python") {
            // python 在 resources/python/Scripts/python.exe
            // 需要向上两级到 resources/
            let parent = dir.parent().map(|p| p.to_path_buf()).unwrap_or(dir.clone());
            let grandparent = parent.parent().map(|p| p.to_path_buf()).unwrap_or(parent.clone());
            crate::log_to_file(&format!("[get_app_dir] Windows python path detected, grandparent: {:?}", grandparent));
            return grandparent;
        }

        // 开发环境：resource_dir() 返回 target/debug/
        // 往上找到项目根目录（包含 app.py 的目录）
        let mut current = dir.clone();
        for _ in 0..5 {
            if let Some(parent) = current.parent() {
                current = parent.to_path_buf();
                if current.join("app.py").exists() {
                    crate::log_to_file(&format!("[get_app_dir] Dev mode, project root: {:?}", current));
                    println!("[annotate] Dev mode, project root: {:?}", current);
                    return current;
                }
            }
        }
        crate::log_to_file(&format!("[get_app_dir] Falling back to dir: {:?}", dir));
        return dir;
    }
    let fallback = std::env::current_dir().unwrap_or_default();
    crate::log_to_file(&format!("[get_app_dir] Using current_dir fallback: {:?}", fallback));
    fallback
}

// ── Tauri Commands ──────────────────────────────────────────

/// 启动 Flask（先检查端口，冲突则自动清理）
#[tauri::command]
pub async fn start_flask(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<String, String> {
    let port = state.flask_port;
    let app_dir = get_app_dir(&app);
    println!("[annotate] start_flask called, app_dir: {:?}", app_dir);

    // 已有 Flask 运行 → 直接复用
    if is_flask_running(port) {
        *state.flask_state.lock().unwrap() = FlaskState::Running;
        return Ok("Flask 已在运行".to_string());
    }

    // 检查是否已在启动中（auto_start_flask 已启动）
    {
        let flask_state = state.flask_state.lock().unwrap();
        if matches!(*flask_state, FlaskState::Starting) {
            return Ok("Flask 正在启动中".to_string());
        }
    }

    // 端口被其他进程占用 → 尝试清理
    if is_port_in_use(port) {
        kill_port_process(port);
    }

    // 启动 Flask 子进程
    match spawn_flask(&app_dir, port) {
        Ok(child) => {
            let pgid = child.id() as i32;
            *state.flask_pgid.lock().unwrap() = Some(pgid);
            *state.flask_process.lock().unwrap() = Some(child);
            *state.flask_state.lock().unwrap() = FlaskState::Starting;
            println!("[annotate] Flask started, pid={}, pgid={}", pgid, pgid);
            Ok("Flask 已启动".to_string())
        }
        Err(e) => {
            *state.flask_state.lock().unwrap() = FlaskState::Error(e.clone());
            Err(e)
        }
    }
}

/// 重启 Flask
#[tauri::command]
pub async fn restart_flask(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<String, String> {
    // 停止现有进程
    #[cfg(unix)]
    {
        let mut pgid = state.flask_pgid.lock().unwrap();
        if let Some(pgid_val) = *pgid {
            unsafe { let _ = libc::kill(-pgid_val, libc::SIGKILL); }
        }
        *pgid = None;
    }
    {
        let mut proc = state.flask_process.lock().unwrap();
        if let Some(ref mut child) = *proc {
            let _ = child.kill();
        }
        *proc = None;
    }

    // 清理端口
    let port = state.flask_port;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    if is_port_in_use(port) {
        kill_port_process(port);
    }

    *state.flask_state.lock().unwrap() = FlaskState::NotStarted;

    // 重新启动
    let app_dir = get_app_dir(&app);
    match spawn_flask(&app_dir, port) {
        Ok(child) => {
            let pgid = child.id() as i32;
            *state.flask_pgid.lock().unwrap() = Some(pgid);
            *state.flask_process.lock().unwrap() = Some(child);
            *state.flask_state.lock().unwrap() = FlaskState::Starting;
            Ok("Flask 已重启".to_string())
        }
        Err(e) => {
            *state.flask_state.lock().unwrap() = FlaskState::Error(e.clone());
            Err(e)
        }
    }
}

/// 停止 Flask
#[tauri::command]
pub async fn stop_flask(state: State<'_, AppState>) -> Result<String, String> {
    // 1. 杀整个进程组（Unix 最可靠）
    #[cfg(unix)]
    {
        let mut pgid = state.flask_pgid.lock().unwrap();
        if let Some(pgid_val) = *pgid {
            println!("[annotate] stop_flask: killing process group {}", pgid_val);
            unsafe {
                let ret = libc::kill(-pgid_val, libc::SIGKILL);
                if ret != 0 {
                    println!("[annotate] stop_flask: kill pgid failed: {}", std::io::Error::last_os_error());
                }
            }
        }
        *pgid = None;
    }

    // 2. 杀子进程 handle
    {
        let mut proc = state.flask_process.lock().unwrap();
        if let Some(ref mut child) = *proc {
            let _ = child.kill();
        }
        *proc = None;
    }

    // 3. 等端口释放 + 兜底清理
    let port = state.flask_port;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    if is_port_in_use(port) {
        println!("[annotate] stop_flask: port {} still in use, force killing...", port);
        kill_port_process(port);
    }

    *state.flask_state.lock().unwrap() = FlaskState::Stopped;
    let port_status = if is_port_in_use(port) { "still in use" } else { "freed" };
    println!("[annotate] stop_flask: Flask stopped, port {} status: {}", port, port_status);
    Ok("Flask 已停止".to_string())
}

/// 在浏览器中打开
#[tauri::command]
pub fn open_in_browser(state: State<'_, AppState>) -> Result<String, String> {
    let url = format!("http://127.0.0.1:{}", state.flask_port);
    open::that(&url).map_err(|e| format!("打开浏览器失败: {}", e))?;
    Ok("已打开浏览器".to_string())
}

/// 获取当前状态
#[tauri::command]
pub fn get_status(state: State<'_, AppState>) -> serde_json::Value {
    let flask_state = state.flask_state.lock().unwrap();
    let state_str = match *flask_state {
        FlaskState::NotStarted => "not_started",
        FlaskState::Starting => "starting",
        FlaskState::Running => "running",
        FlaskState::Stopped => "stopped",
        FlaskState::Error(ref _e) => "error",
    };
    let error_msg = match &*flask_state {
        FlaskState::Error(ref e) => Some(e.clone()),
        _ => None,
    };
    drop(flask_state);

    // 实际检查端口健康状态
    let healthy = is_flask_running(state.flask_port);
    if healthy {
        let mut fs = state.flask_state.lock().unwrap();
        *fs = FlaskState::Running;
    }

    serde_json::json!({
        "state": if healthy { "running" } else { state_str },
        "port": state.flask_port,
        "error": error_msg,
    })
}

/// 清理端口占用
#[tauri::command]
pub fn kill_port(state: State<'_, AppState>) -> Result<String, String> {
    if kill_port_process(state.flask_port) {
        *state.flask_state.lock().unwrap() = FlaskState::Stopped;
        Ok(format!("端口 {} 已释放", state.flask_port))
    } else {
        Err(format!("无法释放端口 {}", state.flask_port))
    }
}

/// 清理 Flask 子进程和端口（应用退出时调用）
pub fn cleanup_flask(state: &AppState) {
    println!("[annotate] Cleaning up Flask before exit...");

    // 1. 杀整个进程组（Unix 最可靠：会杀掉 Python 及其所有子线程/子进程）
    #[cfg(unix)]
    {
        let pgid = state.flask_pgid.lock().unwrap();
        if let Some(pgid) = *pgid {
            println!("[annotate] Killing process group {}", pgid);
            unsafe {
                let ret = libc::kill(-pgid, libc::SIGKILL);
                if ret == 0 {
                    println!("[annotate] Process group {} killed", pgid);
                } else {
                    println!("[annotate] Failed to kill process group {}: errno={}", pgid, std::io::Error::last_os_error());
                }
            }
        }
    }

    // 1. Windows 特定处理：尝试杀掉 Python 进程
    #[cfg(windows)]
    {
        let proc = state.flask_process.lock().unwrap();
        if let Some(ref child) = *proc {
            let pid = child.id();
            println!("[annotate] Killing Python process {} on Windows", pid);
            // 尝试通过taskkill杀掉进程及其子进程
            let result = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string(), "/T"])
                .output();
            if let Ok(output) = result {
                if output.status.success() {
                    println!("[annotate] Windows taskkill successful");
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("[annotate] Windows taskkill failed: {}", stderr);
                }
            }
        }
    }

    // 2. 杀子进程 handle（兜底）
    {
        let mut proc = state.flask_process.lock().unwrap();
        if let Some(ref mut child) = *proc {
            let pid = child.id();
            println!("[annotate] Killing child process {}", pid);
            let _ = child.kill();
            match child.wait() {
                Ok(status) => println!("[annotate] Process {} exited with status: {:?}", pid, status),
                Err(e) => println!("[annotate] Error waiting for process {}: {}", pid, e),
            }
        }
        *proc = None;
    }

    // 3. 确保端口释放（最终兜底）
    if is_port_in_use(state.flask_port) {
        println!("[annotate] Port {} still in use, force killing...", state.flask_port);
        kill_port_process(state.flask_port);
    }

    *state.flask_state.lock().unwrap() = FlaskState::Stopped;
    *state.flask_pgid.lock().unwrap() = None;

    // 等一小段时间确保端口完全释放
    std::thread::sleep(std::time::Duration::from_millis(500));
    println!("[annotate] Cleanup complete, port {} status: {}", state.flask_port, if is_port_in_use(state.flask_port) { "still in use" } else { "freed" });
}
