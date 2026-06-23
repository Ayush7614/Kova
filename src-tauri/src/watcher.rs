use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
use tauri::{AppHandle, Emitter};

pub fn create(
    app: AppHandle,
    path: PathBuf,
    suppress_until: Arc<AtomicU64>,
) -> notify::Result<RecommendedWatcher> {
    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    // Ignore events that arrive within the suppression window set by
                    // write_file — these are caused by Kova's own atomic rename and
                    // should not be surfaced to the frontend as external changes.
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    if now < suppress_until.load(Ordering::Relaxed) {
                        return;
                    }
                    let _ = app.emit("file-changed", ());
                } else if matches!(event.kind, EventKind::Remove(_)) {
                    let _ = app.emit("file-deleted", ());
                }
            }
        },
        Config::default(),
    )?;
    watcher.watch(&path, RecursiveMode::NonRecursive)?;
    Ok(watcher)
}
