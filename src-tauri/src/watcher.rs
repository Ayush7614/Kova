use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

pub fn create(app: AppHandle, path: PathBuf) -> notify::Result<RecommendedWatcher> {
    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
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
