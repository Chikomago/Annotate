use serde::{Deserialize, Serialize};

/// Flask 进程管理器状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum FlaskState {
    NotStarted,
    Starting,
    Running,
    Stopped,
    Error(String),
}

/// 应用状态
pub struct AppState {
    pub flask_state: std::sync::Mutex<FlaskState>,
    pub flask_process: std::sync::Mutex<Option<std::process::Child>>,
    pub flask_port: u16,
    pub flask_pgid: std::sync::Mutex<Option<i32>>,  // 子进程的进程组 ID
}

impl AppState {
    pub fn new(port: u16) -> Self {
        Self {
            flask_state: std::sync::Mutex::new(FlaskState::NotStarted),
            flask_process: std::sync::Mutex::new(None),
            flask_port: port,
            flask_pgid: std::sync::Mutex::new(None),
        }
    }
}
