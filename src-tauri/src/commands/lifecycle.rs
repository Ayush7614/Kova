use super::AppState;
use tauri::{AppHandle, State};

/// Returns true if the running installation supports in-place updates.
/// On Linux this requires AppImage — deb/rpm users must update via their package manager.
#[tauri::command]
pub fn can_self_update() -> bool {
    if cfg!(target_os = "linux") {
        std::env::var("APPIMAGE").is_ok()
    } else {
        true
    }
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Called by the frontend once the unsaved-changes prompt for an app-level
/// quit (Cmd+Q, Dock Quit, etc.) has been resolved — either the user chose to
/// discard/save, or there was nothing to confirm. Marks the exit confirmed so
/// the `RunEvent::ExitRequested` handler in lib.rs lets the retried `app.exit()`
/// through instead of asking again, then triggers the actual exit.
#[tauri::command]
pub fn confirm_exit(app: AppHandle, state: State<'_, AppState>) {
    state.exit_confirmed.store(true, std::sync::atomic::Ordering::SeqCst);
    // tauri-plugin-window-state normally saves on each window's CloseRequested
    // event, but this exit path (app.exit()) goes through RunEvent::ExitRequested
    // instead — whether that still fires CloseRequested for every open window
    // first isn't a guarantee this code wants to depend on, so save explicitly
    // here too. Harmless if the plugin's own hook also fires for the same exit.
    use tauri_plugin_window_state::{AppHandleExt, StateFlags};
    let _ = app.save_window_state(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED);
    app.exit(0);
}
