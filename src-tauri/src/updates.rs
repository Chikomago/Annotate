use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<String>, String> {
    let update = app.updater().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())?;
    let version = update.as_ref().map(|item| item.version.clone());
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(version)
}

#[tauri::command]
pub async fn install_update(pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending.0.lock().map_err(|e| e.to_string())?
        .take().ok_or("请先检测更新")?;
    update.download_and_install(|_, _| {}, || {})
        .await.map_err(|e| e.to_string())
}
