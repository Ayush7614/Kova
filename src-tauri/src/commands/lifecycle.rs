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

/// Terminal-facing exit for CLI-initiated flows (`--present` / `--check`):
/// clean end-of-presentation (no message, code 0) or an error report. The
/// launching terminal is the CLI user's surface — and the main window may
/// still be hidden when errors fire, which makes a GUI dialog unreliable —
/// so messages go to stderr (attaching the parent console on Windows, where
/// the GUI subsystem otherwise swallows it). Exits the process directly
/// rather than via `app.exit(code)`: the code passed to `app.exit` does not
/// survive the run loop's return path (the process ends 0). A cold-started
/// session has no unsaved edits and deliberately skips the window-state
/// save; the one cleanup that matters — releasing the wake lock, whose
/// macOS `caffeinate` child would be orphaned by a hard exit — is the
/// caller's responsibility before invoking this.
/// macOS: symlink the running binary into a PATH directory so `kova` works
/// from a terminal (docs/plans/kova-cli.md, Phase D). User-initiated via the
/// app menu — the VS Code "install shell command" pattern — rather than done
/// silently at install time. Returns the directory linked into; the Err
/// carries a manual `ln -s` command for the no-writable-dir case. Never
/// clobbers a `kova` that isn't ours: only replaces symlinks whose target
/// points into a Kova.app bundle (e.g. after the app was moved).
#[tauri::command]
pub fn install_cli_symlink() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        // Homebrew's bin (Apple Silicon, then Intel) is on PATH for virtually
        // every terminal user; /usr/local/bin also covers non-Homebrew setups.
        for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let dir_path = std::path::Path::new(dir);
            if !dir_path.is_dir() {
                continue;
            }
            let link = dir_path.join("kova");
            match std::fs::read_link(&link) {
                Ok(target) if target == exe => return Ok(dir.to_string()),
                Ok(target) if target.to_string_lossy().contains("Kova.app") => {
                    let _ = std::fs::remove_file(&link);
                }
                Ok(_) => continue, // someone else's `kova` — leave it alone
                Err(_) => {
                    // Not a symlink. A regular file named `kova` is also not
                    // ours to overwrite; nothing there at all is fine.
                    if link.symlink_metadata().is_ok() {
                        continue;
                    }
                }
            }
            if std::os::unix::fs::symlink(&exe, &link).is_ok() {
                return Ok(dir.to_string());
            }
        }
        Err(format!("ln -s \"{}\" /usr/local/bin/kova", exe.display()))
    }
    #[cfg(not(target_os = "macos"))]
    Err("only available on macOS".to_string())
}

/// Print to the launching terminal's stdout (used for --check reports, which
/// are data, unlike the error reporting on stderr in cli_exit below).
#[tauri::command]
pub fn cli_stdout(text: String) {
    crate::cli::attach_parent_console();
    println!("{text}");
}

#[tauri::command]
pub fn cli_exit(message: Option<String>, code: i32) {
    crate::cli::attach_parent_console();
    if let Some(msg) = message {
        eprintln!("kova: {msg}");
    }
    std::process::exit(code);
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
